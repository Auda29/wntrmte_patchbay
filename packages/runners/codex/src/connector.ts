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
import { parseCodexLine, parseCodexResponse } from './stream-parser';

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// JSON-RPC helper — format a request to send over stdin
// ---------------------------------------------------------------------------

let rpcIdCounter = 0;

function jsonRpcRequest(method: string, params: Record<string, unknown> = {}): { id: number; payload: string } {
    const id = ++rpcIdCounter;
    return {
        id,
        payload: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    };
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
    private pendingRequests = new Map<number | string, string>();
    private pendingFollowupMessage: string | null = null;

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
            const events = this.parseLine(line);
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

    queueFollowupMessage(text: string): void {
        this.pendingFollowupMessage = text;
    }

    sendRequest(method: string, params: Record<string, unknown> = {}): void {
        if (!this.child?.stdin?.writable) {
            throw new Error('Session stdin is not writable');
        }
        const request = jsonRpcRequest(method, params);
        this.pendingRequests.set(request.id, method);
        this.child.stdin.write(request.payload + '\n');
    }

    private parseLine(line: string) {
        const trimmed = line.trim();
        if (!trimmed) {
            return [];
        }

        let raw: Record<string, unknown>;
        try {
            raw = JSON.parse(trimmed);
        } catch {
            return [];
        }

        if (raw.jsonrpc !== '2.0') {
            return [];
        }

        if (raw.id !== undefined) {
            const requestMethod = this.pendingRequests.get(raw.id as number | string);
            if (requestMethod) {
                this.pendingRequests.delete(raw.id as number | string);
            }
            const events = parseCodexResponse(raw as {
                jsonrpc: '2.0';
                id: number | string;
                result?: Record<string, unknown>;
                error?: { code?: number; message?: string; data?: unknown };
            }, this.sessionId, this.connectorId, requestMethod);

            if (
                (requestMethod === 'thread.resume' || requestMethod === 'thread.fork')
                && this.pendingFollowupMessage
                && !('error' in raw && raw.error)
            ) {
                const followupMessage = this.pendingFollowupMessage;
                this.pendingFollowupMessage = null;
                this.child?.stdin?.write(jsonRpcNotification('user.message', { content: followupMessage }) + '\n');
            } else if ((requestMethod === 'thread.resume' || requestMethod === 'thread.fork') && 'error' in raw && raw.error) {
                this.pendingFollowupMessage = null;
            }

            return events;
        }

        return parseCodexLine(trimmed, this.sessionId, this.connectorId);
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
        const prompt = input.resumeSessionId || input.forkSessionId ? input.goal : buildPrompt(input);
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

        if (input.forkSessionId) {
            session.queueFollowupMessage(prompt);
            session.sendRequest('thread.fork', { threadId: input.forkSessionId });
        } else if (input.resumeSessionId) {
            session.queueFollowupMessage(prompt);
            session.sendRequest('thread.resume', { threadId: input.resumeSessionId });
        } else {
            session.sendRequest('thread.create', { prompt });
        }

        return session;
    }
}
