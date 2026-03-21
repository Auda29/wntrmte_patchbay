import { Runner, RunnerInput, RunnerOutput, RunnerAuth } from '@patchbay/core';
import { exec } from 'child_process';
import { promisify } from 'util';
import { spawn } from 'child_process';
import { buildPrompt } from '@patchbay/runner-claude-code';

const execAsync = promisify(exec);
const DEFAULT_RUNNER_TIMEOUT_MS = 900_000;
const codexNoisePatterns = [
    /^reading prompt from stdin/i,
    /^openai codex\b/i,
    /^-+$/,
    /^(workdir|model|provider|approval|sandbox|reasoning effort|reasoning summaries|session id):/i,
    /^(user|codex|exec)$/i,
    /^mcp:/i,
    /^mcp startup:/i,
    /^tokens used$/i,
    /^\d[\d.,]*$/,
    /^".*"\s+in\s+.+$/i,
    /^(succeeded|exited)\s+in\s+/i,
    /^prompt built \(\d+ chars\)$/i,
    /^verzeichnis:/i,
    /^(mode|----)\b/i,
];

function getRunnerTimeoutMs(): number {
    const raw = process.env.PATCHBAY_RUNNER_TIMEOUT_MS;
    if (!raw) return DEFAULT_RUNNER_TIMEOUT_MS;

    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RUNNER_TIMEOUT_MS;
}

function isCodexNoiseLine(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) return true;
    return codexNoisePatterns.some((pattern) => pattern.test(trimmed));
}

function extractCodexSummary(fullOutput: string, fallback?: string): string {
    const lines = fullOutput.split(/\r?\n/);
    const summaryLines: string[] = [];

    for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index].trim();
        if (!line) {
            if (summaryLines.length > 0) break;
            continue;
        }

        if (isCodexNoiseLine(line)) {
            if (summaryLines.length > 0) break;
            continue;
        }

        summaryLines.push(line);
    }

    if (summaryLines.length === 0) {
        return fallback ?? 'Codex run completed.';
    }

    return summaryLines.reverse().join('\n');
}

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
            const isWin = process.platform === 'win32';
            const bin = 'codex';
            const args = ['exec', '--full-auto', '--skip-git-repo-check'];
            const timeoutMs = getRunnerTimeoutMs();
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
                        logs.push('HINT: Codex produced no output before timing out. It may be waiting for auth or another interactive prerequisite.');
                    } else {
                        logs.push(`HINT: Codex stopped producing output for the last ${quietSeconds}s before timeout.`);
                    }
                    resolve({
                        status: 'failed',
                        summary: !sawOutput
                            ? `Codex run timed out after ${timeoutSeconds} seconds without producing output.`
                            : `Codex run timed out after ${timeoutSeconds} seconds.`,
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
                    summary: `Codex run failed: ${message}`,
                    logs,
                });
            });

            child.on('close', (code: number | null) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                if (code === 0) {
                    const fullOutput = logs.join('');
                    resolve({
                        status: 'completed',
                        summary: extractCodexSummary(fullOutput, firstLine),
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
