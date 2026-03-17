import { Runner, RunnerInput, RunnerOutput, RunnerAuth } from '@patchbay/core';
import { exec } from 'child_process';
import { promisify } from 'util';
import { spawn } from 'child_process';
import { buildPrompt } from '@patchbay/runner-claude-code';

export class CursorCliRunner implements Runner {
    name = 'cursor-cli';

    constructor(private readonly auth?: RunnerAuth) {}

    async execute(input: RunnerInput): Promise<RunnerOutput> {
        const logs: string[] = [];

        // Check if cursor CLI is available
        try {
            await execAsync('cursor --version');
        } catch {
            return {
                status: 'failed',
                summary: 'cursor CLI not found. Install Cursor and ensure it is in PATH.',
                logs: ['ERROR: `cursor` command not found in PATH.'],
            };
        }

        const prompt = buildPrompt(input);
        logs.push(`Prompt built (${prompt.length} chars)`);

        const env = this.auth?.mode === 'apiKey'
            ? { ...process.env, CURSOR_API_KEY: this.auth.apiKey }
            : process.env;

        return new Promise<RunnerOutput>((resolve) => {
            const args = ['agent', '-p', prompt, '--output-format', 'text'];
            const child = spawn('cursor', args, {
                cwd: input.repoPath,
                env,
            });

            let firstLine: string | undefined;

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
                const message = error.message;
                logs.push(`ERROR:\n${message}`);
                resolve({
                    status: 'failed',
                    summary: `Cursor CLI run failed: ${message}`,
                    logs,
                });
            });

            child.on('close', (code: number | null) => {
                if (code === 0) {
                    resolve({
                        status: 'completed',
                        summary: firstLine ?? 'Cursor CLI run completed.',
                        logs,
                    });
                } else {
                    logs.push(`EXIT CODE: ${code ?? 'null'}`);
                    resolve({
                        status: 'failed',
                        summary: `Cursor CLI run failed with exit code ${code}`,
                        logs,
                    });
                }
            });
        });
    }
}
