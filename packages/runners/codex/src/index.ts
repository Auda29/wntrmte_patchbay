import { Runner, RunnerInput, RunnerOutput, RunnerAuth } from '@patchbay/core';
import { exec } from 'child_process';
import { promisify } from 'util';
import { spawn } from 'child_process';
import { buildPrompt } from '@patchbay/runner-claude-code';

const execAsync = promisify(exec);

export class CodexRunner implements Runner {
    name = 'codex';

    constructor(private readonly auth?: RunnerAuth) {}

    async execute(input: RunnerInput): Promise<RunnerOutput> {
        const logs: string[] = [];

        // Check if codex CLI is available
        try {
            await execAsync('codex --version');
        } catch {
            return {
                status: 'failed',
                summary: 'codex CLI not found. Install OpenAI Codex CLI to use this runner.',
                logs: ['ERROR: `codex` command not found in PATH.'],
                installHint: 'npm install -g @openai/codex',
            };
        }

        const prompt = buildPrompt(input);
        logs.push(`Prompt built (${prompt.length} chars)`);

        const env = this.auth?.mode === 'apiKey'
            ? { ...process.env, OPENAI_API_KEY: this.auth.apiKey }
            : process.env;

        return new Promise<RunnerOutput>((resolve) => {
            const bin = process.platform === 'win32' ? 'codex.cmd' : 'codex';
            const args = ['exec', prompt];
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
                        summary: 'Codex run timed out after 300 seconds.',
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
                    summary: `Codex run failed: ${message}`,
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
                        summary: firstLine ?? 'Codex run completed.',
                        logs,
                    });
                } else {
                    logs.push(`EXIT CODE: ${code ?? 'null'}`);
                    resolve({
                        status: 'failed',
                        summary: `Codex run failed with exit code ${code}`,
                        logs,
                    });
                }
            });
        });
    }
}
