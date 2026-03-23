export { ClaudeCodeConnector } from './connector';
export { parseStreamLine } from './stream-parser';

import { Runner, RunnerInput, RunnerOutput, RunnerAuth } from '@patchbay/core';
import { exec } from 'child_process';
import { promisify } from 'util';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);
const DEFAULT_RUNNER_TIMEOUT_MS = 900_000;

function getRunnerTimeoutMs(): number {
    const raw = process.env.PATCHBAY_RUNNER_TIMEOUT_MS;
    if (!raw) return DEFAULT_RUNNER_TIMEOUT_MS;

    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RUNNER_TIMEOUT_MS;
}

export function buildPrompt(input: RunnerInput): string {
    const parts: string[] = [];

    // Inject previous conversation turns for context (fallback for non-resume runners)
    if (input.previousTurns?.length) {
        const turnLines = input.previousTurns.map(
            t => `### ${t.role} (${t.timestamp})\n${t.content}`
        );
        parts.push(`## Previous Conversation\n${turnLines.join('\n\n')}`);
    }

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

/** Detect whether runner output is a clarifying question rather than real work. */
function detectQuestion(output: string): boolean {
    const trimmed = output.trim();
    // Long outputs are real work, not questions
    if (trimmed.length > 1500) return false;
    // Ends with a question mark
    if (trimmed.endsWith('?')) return true;

    // Common clarification and approval-request patterns
    return /(?:which|could you|can you|do you want|please (?:provide|specify|choose|clarify|approve)|need (?:your )?permission|waiting for (?:your )?approval|may i|approve (?:the|this) (?:edit|change)|permission to edit)/i.test(trimmed);
}

/** Extract the actual question from the output. */
function extractQuestion(output: string): string {
    const lines = output.trim().split('\n');
    // Find the last line ending with '?'
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim().endsWith('?')) {
            return lines[i].trim();
        }
    }

    // Fall back to the last non-empty line that looks like an approval request.
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;
        if (/(?:please approve|need (?:your )?permission|waiting for (?:your )?approval|may i|approve (?:the|this) (?:edit|change)|permission to edit)/i.test(line)) {
            return line;
        }
    }

    return output.trim();
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

        // When resuming a conversation, use the user's reply as the prompt directly.
        // Otherwise build the full structured prompt from task context.
        const prompt = input.resumeSessionId
            ? input.goal
            : buildPrompt(input);
        logs.push(`Prompt built (${prompt.length} chars)`);

        const env = this.auth?.mode === 'apiKey'
            ? { ...process.env, ANTHROPIC_API_KEY: this.auth.apiKey }
            : process.env;

        // Pre-assign a session ID so we can resume later.
        // If resuming an existing session, use --resume instead.
        const sessionId = input.resumeSessionId ?? randomUUID();

        return new Promise<RunnerOutput>((resolve) => {
            const isWin = process.platform === 'win32';
            const bin = 'claude';
            const timeoutMs = getRunnerTimeoutMs();

            const args = input.resumeSessionId
                ? ['--resume', input.resumeSessionId, '-p']
                : ['--session-id', sessionId, '-p'];

            const child = spawn(bin, args, {
                cwd: input.repoPath,
                env,
                shell: isWin,
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            child.stdin!.write(prompt);
            child.stdin!.end();

            let firstLine: string | undefined;
            let settled = false;
            let sawOutput = false;
            let lastOutputAt = Date.now();

            const timeout = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    child.kill();
                    const quietSeconds = Math.max(0, Math.floor((Date.now() - lastOutputAt) / 1000));
                    const timeoutSeconds = Math.floor(timeoutMs / 1000);
                    logs.push(`TIMEOUT: Process killed after ${timeoutSeconds}s.`);
                    if (!sawOutput) {
                        logs.push('HINT: Claude produced no output before timing out. It may be waiting for auth or an interactive approval.');
                    } else {
                        logs.push(`HINT: Claude stopped producing output for the last ${quietSeconds}s before timeout.`);
                    }
                    resolve({
                        status: 'failed',
                        summary: !sawOutput
                            ? `Claude Code run timed out after ${timeoutSeconds} seconds without producing output.`
                            : `Claude Code run timed out after ${timeoutSeconds} seconds.`,
                        logs,
                    });
                }
            }, timeoutMs);

            child.stdout?.on('data', (chunk: Buffer) => {
                const text = chunk.toString();
                process.stdout.write(text);
                logs.push(text);
                sawOutput = true;
                lastOutputAt = Date.now();
                if (!firstLine) {
                    firstLine = text.split('\n').find((line) => line.trim());
                }
            });

            child.stderr?.on('data', (chunk: Buffer) => {
                const text = chunk.toString();
                process.stderr.write(text);
                logs.push(text);
                sawOutput = true;
                lastOutputAt = Date.now();
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

                const fullOutput = logs.join('');

                if (code === 0) {
                    const isQuestion = detectQuestion(fullOutput);
                    if (isQuestion) {
                        resolve({
                            status: 'awaiting_input',
                            summary: firstLine ?? 'Runner is asking a clarifying question.',
                            question: extractQuestion(fullOutput),
                            sessionId,
                            logs,
                        });
                    } else {
                        resolve({
                            status: 'completed',
                            summary: firstLine ?? 'Claude Code run completed.',
                            sessionId,
                            logs,
                        });
                    }
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
