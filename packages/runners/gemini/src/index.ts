export { GeminiConnector } from './connector';
export { parseGeminiLine } from './stream-parser';

import { Runner, RunnerInput, RunnerOutput, RunnerAuth } from '@patchbay/core';
import { exec } from 'child_process';
import { promisify } from 'util';
import { spawn } from 'child_process';
import { buildPrompt } from '@patchbay/core';

const execAsync = promisify(exec);
const DEFAULT_RUNNER_TIMEOUT_MS = 900_000;

function getRunnerTimeoutMs(): number {
    const raw = process.env.PATCHBAY_RUNNER_TIMEOUT_MS;
    if (!raw) return DEFAULT_RUNNER_TIMEOUT_MS;

    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RUNNER_TIMEOUT_MS;
}

export class GeminiRunner implements Runner {
    name = 'gemini';

    constructor(private readonly auth?: RunnerAuth) {}

    async execute(input: RunnerInput): Promise<RunnerOutput> {
        const logs: string[] = [];

        // Check if gemini CLI is available
        try {
            await execAsync('gemini --version');
        } catch {
            return {
                status: 'failed',
                summary: 'gemini CLI not found. Install Google Gemini CLI to use this runner.',
                logs: ['ERROR: `gemini` command not found in PATH.'],
                installHint: 'npm install -g @google/gemini-cli',
            };
        }

        const prompt = buildPrompt(input);
        logs.push(`Prompt built (${prompt.length} chars)`);

        const env = this.auth?.mode === 'apiKey'
            ? { ...process.env, GEMINI_API_KEY: this.auth.apiKey }
            : process.env;

        return new Promise<RunnerOutput>((resolve) => {
            const isWin = process.platform === 'win32';
            const bin = 'gemini';
            const timeoutMs = getRunnerTimeoutMs();
            const child = spawn(bin, ['-p'], {
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
                        logs.push('HINT: Gemini produced no output before timing out. It may be waiting for auth or another interactive prerequisite.');
                    } else {
                        logs.push(`HINT: Gemini stopped producing output for the last ${quietSeconds}s before timeout.`);
                    }
                    resolve({
                        status: 'failed',
                        summary: !sawOutput
                            ? `Gemini run timed out after ${timeoutSeconds} seconds without producing output.`
                            : `Gemini run timed out after ${timeoutSeconds} seconds.`,
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
                    summary: `Gemini run failed: ${message}`,
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
                        summary: firstLine ?? 'Gemini run completed.',
                        logs,
                    });
                } else {
                    logs.push(`EXIT CODE: ${code ?? 'null'}`);
                    resolve({
                        status: 'failed',
                        summary: `Gemini run failed with exit code ${code}`,
                        logs,
                    });
                }
            });
        });
    }
}
