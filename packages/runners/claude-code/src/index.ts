import { Runner, RunnerInput, RunnerOutput, RunnerAuth } from '@patchbay/core';
import { exec } from 'child_process';
import { promisify } from 'util';
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
            };
        }

        const prompt = buildPrompt(input);
        logs.push(`Prompt built (${prompt.length} chars)`);

        const env = this.auth?.mode === 'apiKey'
            ? { ...process.env, ANTHROPIC_API_KEY: this.auth.apiKey }
            : process.env;

        try {
            const { stdout, stderr } = await execAsync(
                `claude -p ${JSON.stringify(prompt)}`,
                { cwd: input.repoPath, maxBuffer: 10 * 1024 * 1024, env }
            );

            if (stderr) logs.push(`STDERR:\n${stderr}`);
            if (stdout) logs.push(`OUTPUT:\n${stdout}`);

            return {
                status: 'completed',
                summary: stdout.split('\n').find(l => l.trim()) ?? 'Claude Code run completed.',
                logs,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logs.push(`ERROR:\n${message}`);
            return {
                status: 'failed',
                summary: `Claude Code run failed: ${message}`,
                logs,
            };
        }
    }
}
