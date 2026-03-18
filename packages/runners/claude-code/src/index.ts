import { Runner, RunnerInput, RunnerOutput, RunnerAuth } from '@patchbay/core';
import { exec } from 'child_process';
import { promisify } from 'util';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export function buildPrompt(input: RunnerInput): string {
    const parts: string[] = [];

    if (input.projectRules) {
        parts.push(`## Project Rules\n${input.projectRules}`);
    }

    if (input.contextFiles?.length) {
        const contextParts = input.contextFiles
            .filter(f => fs.existsSync(f))
            .map(f => `### ${path.basename(f)}\n${fs.readFileSync(f, 'utf-8')}`);
        if (contextParts.length) {
            parts.push(`## Context\n${contextParts.join('\n\n')}`);
        }
    }

    if (input.affectedFiles?.length) {
        parts.push(`## Affected Files\n${input.affectedFiles.map(f => `- ${f}`).join('\n')}`);
    }

    parts.push(`## Task\n${input.goal}`);

    return parts.join('\n\n');
}

export class ClaudeCodeRunner implements Runner {
    name = 'claude-code';

    constructor(private readonly auth?: RunnerAuth) {}

    async execute(input: RunnerInput): Promise<RunnerOutput> {
        const logs: string[] = [];

        // Check if claude CLI is available
        try {
            await execAsync('claude --version');
        } catch {
            return {
                status: 'failed',
                summary: 'claude CLI not found. Install Claude Code to use this runner.',
                logs: ['ERROR: `claude` command not found in PATH.'],
                installHint: 'npm install -g @anthropic-ai/claude-code',
            };
        }

        const prompt = buildPrompt(input);
        logs.push(`Prompt built (${prompt.length} chars)`);

        const env = this.auth?.mode === 'apiKey'
            ? { ...process.env, ANTHROPIC_API_KEY: this.auth.apiKey }
            : process.env;

        return new Promise<RunnerOutput>((resolve) => {
            const bin = process.platform === 'win32' ? 'claude.cmd' : 'claude';
            const args = ['-p', prompt];
            const child = spawn(bin, args, {
                cwd: input.repoPath,
                env,
            });

            let firstLine: string | undefined;
            let settled = false;

            const timeout = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    child.kill();
                    logs.push('TIMEOUT: Process killed after 300s.');
                    resolve({
                        status: 'failed',
                        summary: 'Claude Code run timed out after 300 seconds.',
                        logs,
                    });
                }
            }, 300_000);

            child.stdout?.on('data', (chunk: Buffer) => {
                const text = chunk.toString();
                process.stdout.write(text);
                logs.push(text);
                if (!firstLine) {
                    firstLine = text.split('\n').find((line) => line.trim());
                }
            });

            child.stderr?.on('data', (chunk: Buffer) => {
                const text = chunk.toString();
                process.stderr.write(text);
                logs.push(text);
            });

            child.on('error', (error: Error) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                const message = error.message;
                logs.push(`ERROR:\n${message}`);
                resolve({
                    status: 'failed',
                    summary: `Claude Code run failed: ${message}`,
                    logs,
                });
            });

            child.on('close', (code: number | null) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                if (code === 0) {
                    resolve({
                        status: 'completed',
                        summary: firstLine ?? 'Claude Code run completed.',
                        logs,
                    });
                } else {
                    logs.push(`EXIT CODE: ${code ?? 'null'}`);
                    resolve({
                        status: 'failed',
                        summary: `Claude Code run failed with exit code ${code}`,
                        logs,
                    });
                }
            });
        });
    }
}
