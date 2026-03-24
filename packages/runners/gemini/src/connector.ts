import {
    BaseConnector,
    BaseSession,
    RunnerAuth,
    RunnerInput,
    AgentSession,
    ConnectorCapabilities,
} from '@patchbay/core';
import { spawn, ChildProcess } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { createInterface } from 'readline';
import { buildPrompt } from '@patchbay/core';
import { parseGeminiLine } from './stream-parser';

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// GeminiSession — live session wrapping a `gemini` child process
// ---------------------------------------------------------------------------

class GeminiSession extends BaseSession {
    readonly sessionId: string;
    readonly connectorId: string;
    readonly taskId: string;

    private child: ChildProcess | null = null;
    private stderrChunks: string[] = [];

    constructor(sessionId: string, connectorId: string, taskId: string) {
        super();
        this.sessionId = sessionId;
        this.connectorId = connectorId;
        this.taskId = taskId;
    }

    attach(child: ChildProcess): void {
        this.child = child;
        this.setStatus('active');

        const rl = createInterface({ input: child.stdout! });

        rl.on('line', (line: string) => {
            const events = parseGeminiLine(line, this.sessionId, this.connectorId);
            for (const event of events) {
                if (event.type === 'agent:question') {
                    this.setStatus('awaiting_input');
                } else if (event.type === 'session:completed') {
                    this.setStatus('completed');
                } else if (event.type === 'session:failed') {
                    this.setStatus('failed');
                }
                this.emit(event);
            }
        });

        child.stderr?.on('data', (chunk: Buffer) => {
            this.stderrChunks.push(chunk.toString());
        });

        child.on('error', (error: Error) => {
            this.setStatus('failed');
            this.emit({
                type: 'session:failed',
                sessionId: this.sessionId,
                error: error.message,
                timestamp: new Date().toISOString(),
            });
            this.emitClose();
        });

        child.on('close', (code: number | null) => {
            if (this.status !== 'completed' && this.status !== 'failed' && this.status !== 'cancelled') {
                if (code === 0) {
                    this.setStatus('completed');
                    this.emit({
                        type: 'session:completed',
                        sessionId: this.sessionId,
                        timestamp: new Date().toISOString(),
                    });
                } else {
                    const detail = this.stderrChunks.join('').trim();
                    this.setStatus('failed');
                    this.emit({
                        type: 'session:failed',
                        sessionId: this.sessionId,
                        error: detail
                            ? `Process exited with code ${code}: ${detail}`
                            : `Process exited with code ${code}`,
                        timestamp: new Date().toISOString(),
                    });
                }
            }
            this.emitClose();
        });
    }

    async sendInput(text: string): Promise<void> {
        if (!this.child?.stdin?.writable) {
            throw new Error('Session stdin is not writable');
        }
        this.child.stdin.write(text + '\n');
        this.setStatus('active');
    }

    async approve(_permissionId: string): Promise<void> {
        // Gemini headless mode does not support granular permission approval;
        // sending "yes" / confirmation via stdin as best-effort.
        await this.sendInput('yes');
    }

    async deny(_permissionId: string): Promise<void> {
        await this.sendInput('no');
    }

    async cancel(): Promise<void> {
        this.setStatus('cancelled');
        if (this.child) {
            this.child.kill();
            this.child = null;
        }
        this.emitClose();
    }
}

// ---------------------------------------------------------------------------
// GeminiConnector — spawns `gemini` in headless/JSON mode
// ---------------------------------------------------------------------------

export class GeminiConnector extends BaseConnector {
    readonly id = 'gemini';
    readonly name = 'Gemini';
    readonly capabilities: ConnectorCapabilities = {
        streaming: true,
        permissions: false,
        multiTurn: true,
        toolUseReporting: true,
    };

    constructor(private readonly auth?: RunnerAuth) {
        super();
    }

    async isAvailable(): Promise<boolean> {
        try {
            await execAsync('gemini --version');
            return true;
        } catch {
            return false;
        }
    }

    async connect(input: RunnerInput): Promise<AgentSession> {
        const sessionId = input.sessionId ?? randomUUID();
        const prompt = buildPrompt(input);
        const isWin = process.platform === 'win32';

        const env = this.auth?.mode === 'apiKey'
            ? { ...process.env, GEMINI_API_KEY: this.auth.apiKey }
            : process.env;

        // Gemini CLI headless mode: -p for prompt via stdin, --json for JSON output
        const child = spawn('gemini', ['-p', '--json'], {
            cwd: input.repoPath,
            env,
            shell: isWin,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        const session = new GeminiSession(sessionId, this.id, input.taskId);
        session.attach(child);

        // Send initial prompt via stdin
        child.stdin!.write(prompt + '\n');

        return session;
    }
}
