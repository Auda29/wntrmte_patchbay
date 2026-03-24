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
import { parseCodexLine } from './stream-parser';

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// JSON-RPC helper — format a request to send over stdin
// ---------------------------------------------------------------------------

let rpcIdCounter = 0;

function jsonRpcRequest(method: string, params: Record<string, unknown> = {}): string {
    return JSON.stringify({ jsonrpc: '2.0', id: ++rpcIdCounter, method, params });
}

function jsonRpcNotification(method: string, params: Record<string, unknown> = {}): string {
    return JSON.stringify({ jsonrpc: '2.0', method, params });
}

// ---------------------------------------------------------------------------
// CodexSession — live session wrapping `codex app-server` child process
// ---------------------------------------------------------------------------

class CodexSession extends BaseSession {
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
            const events = parseCodexLine(line, this.sessionId, this.connectorId);
            for (const event of events) {
                if (event.type === 'agent:permission') {
                    this.setStatus('awaiting_permission');
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
        this.child.stdin.write(jsonRpcNotification('user.message', { content: text }) + '\n');
        this.setStatus('active');
    }

    async approve(permissionId: string): Promise<void> {
        if (!this.child?.stdin?.writable) {
            throw new Error('Session stdin is not writable');
        }
        this.child.stdin.write(jsonRpcNotification('approval.response', { id: permissionId, approved: true }) + '\n');
        this.setStatus('active');
    }

    async deny(permissionId: string): Promise<void> {
        if (!this.child?.stdin?.writable) {
            throw new Error('Session stdin is not writable');
        }
        this.child.stdin.write(jsonRpcNotification('approval.response', { id: permissionId, approved: false }) + '\n');
        this.setStatus('active');
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
// CodexConnector — spawns `codex app-server` with JSON-RPC over stdio
// ---------------------------------------------------------------------------

export class CodexConnector extends BaseConnector {
    readonly id = 'codex';
    readonly name = 'Codex';
    readonly capabilities: ConnectorCapabilities = {
        streaming: true,
        permissions: true,
        multiTurn: true,
        toolUseReporting: true,
    };

    constructor(private readonly auth?: RunnerAuth) {
        super();
    }

    async isAvailable(): Promise<boolean> {
        try {
            await execAsync('codex --version');
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
            ? { ...process.env, OPENAI_API_KEY: this.auth.apiKey }
            : process.env;

        const child = spawn('codex', ['app-server'], {
            cwd: input.repoPath,
            env,
            shell: isWin,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        const session = new CodexSession(sessionId, this.id, input.taskId);
        session.attach(child);

        // Send initial prompt via JSON-RPC
        child.stdin!.write(jsonRpcRequest('thread.create', { prompt }) + '\n');

        return session;
    }
}
