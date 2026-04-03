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
    private pendingApprovalRequests = new Map<string, number | string>();
    private threadId: string | null = null;
    private currentTurnId: string | null = null;
    private initialInput: string | null = null;
    private repoPath: string | null = null;
    private startupMode: 'start' | 'resume' | 'fork' = 'start';
    private startupThreadId: string | null = null;
    private started = false;

    constructor(sessionId: string, connectorId: string, taskId: string) {
        super();
        this.sessionId = sessionId;
        this.connectorId = connectorId;
        this.taskId = taskId;
    }

    attach(child: ChildProcess, repoPath: string, initialInput: string): void {
        this.child = child;
        this.repoPath = repoPath;
        this.initialInput = initialInput;
        this.setStatus('active');

        const rl = createInterface({ input: child.stdout! });

        rl.on('line', (line: string) => {
            const events = this.parseLine(line);
            for (const event of events) {
                if (event.type === 'session:started') {
                    if (this.started) {
                        continue;
                    }
                    this.started = true;
                } else if (event.type === 'agent:permission') {
                    this.setStatus('awaiting_permission');
                } else if (event.type === 'session:completed') {
                    this.currentTurnId = null;
                    this.setStatus('completed');
                } else if (event.type === 'session:failed') {
                    this.currentTurnId = null;
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

    beginHandshake(mode: 'start' | 'resume' | 'fork', threadId?: string): void {
        this.startupMode = mode;
        this.startupThreadId = threadId ?? null;
        this.sendRequest('initialize', {
            clientInfo: {
                name: 'patchbay',
                title: 'Patchbay',
                version: '0.1.0',
            },
        });
    }

    sendRequest(method: string, params: Record<string, unknown> = {}): void {
        if (!this.child?.stdin?.writable) {
            throw new Error('Session stdin is not writable');
        }
        const request = jsonRpcRequest(method, params);
        this.pendingRequests.set(request.id, method);
        this.child.stdin.write(request.payload + '\n');
    }

    private sendResponse(id: number | string, result: unknown): void {
        if (!this.child?.stdin?.writable) {
            throw new Error('Session stdin is not writable');
        }
        this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
    }

    private sendNotification(method: string, params: Record<string, unknown> = {}): void {
        if (!this.child?.stdin?.writable) {
            throw new Error('Session stdin is not writable');
        }
        this.child.stdin.write(jsonRpcNotification(method, params) + '\n');
    }

    private startTurn(text: string): void {
        if (!this.threadId) {
            throw new Error('Codex thread is not initialized');
        }
        const params: Record<string, unknown> = {
            threadId: this.threadId,
            input: [{ type: 'text', text }],
        };
        if (this.repoPath) {
            params.cwd = this.repoPath;
        }
        this.sendRequest('turn/start', params);
        this.setStatus('active');
    }

    private resumeActiveTurn(text: string): void {
        if (!this.threadId || !this.currentTurnId) {
            this.startTurn(text);
            return;
        }
        this.sendRequest('turn/steer', {
            threadId: this.threadId,
            expectedTurnId: this.currentTurnId,
            input: [{ type: 'text', text }],
        });
        this.setStatus('active');
    }

    private parseServerRequest(raw: {
        jsonrpc: '2.0';
        id: number | string;
        method: string;
        params?: Record<string, unknown>;
    }) {
        const now = new Date().toISOString();
        const params = raw.params ?? {};
        const permissionId = String(raw.id);

        if (raw.method === 'item/commandExecution/requestApproval' || raw.method === 'item/fileChange/requestApproval') {
            this.pendingApprovalRequests.set(permissionId, raw.id);
            const description = [
                typeof params.reason === 'string' ? params.reason : undefined,
                typeof params.command === 'string' ? params.command : undefined,
                typeof params.cwd === 'string' ? `cwd: ${params.cwd}` : undefined,
            ].filter(Boolean).join('\n') || 'Approval requested';

            return [{
                type: 'agent:permission' as const,
                sessionId: this.sessionId,
                description,
                permissionId,
                toolName: typeof params.command === 'string' ? params.command : undefined,
                timestamp: now,
            }];
        }

        if (raw.method === 'item/tool/requestUserInput') {
            const question = typeof params.prompt === 'string'
                ? params.prompt
                : typeof params.message === 'string'
                    ? params.message
                    : 'Codex is requesting more input.';
            return [{
                type: 'agent:question' as const,
                sessionId: this.sessionId,
                question,
                timestamp: now,
            }];
        }

        return [];
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

        if (raw.id !== undefined && typeof raw.method === 'string') {
            return this.parseServerRequest(raw as {
                jsonrpc: '2.0';
                id: number | string;
                method: string;
                params?: Record<string, unknown>;
            });
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

            if ('error' in raw && raw.error) {
                return events;
            }

            if (requestMethod === 'initialize') {
                this.sendNotification('initialized');
                if (this.startupMode === 'resume' && this.startupThreadId) {
                    this.sendRequest('thread/resume', { threadId: this.startupThreadId });
                } else if (this.startupMode === 'fork' && this.startupThreadId) {
                    this.sendRequest('thread/fork', { threadId: this.startupThreadId });
                } else {
                    this.sendRequest('thread/start', this.repoPath ? { cwd: this.repoPath } : {});
                }
            } else if (requestMethod === 'thread/start') {
                const result = raw.result as Record<string, unknown> | undefined;
                const thread = result?.thread as Record<string, unknown> | undefined;
                this.threadId = typeof thread?.id === 'string' ? thread.id : null;
                if (this.threadId && this.initialInput) {
                    const initialInput = this.initialInput;
                    this.initialInput = null;
                    this.startTurn(initialInput);
                }
            } else if (requestMethod === 'thread/resume' || requestMethod === 'thread/fork') {
                const result = raw.result as Record<string, unknown> | undefined;
                const thread = result?.thread as Record<string, unknown> | undefined;
                this.threadId = typeof thread?.id === 'string' ? thread.id : null;
                if (this.threadId && this.initialInput) {
                    const initialInput = this.initialInput;
                    this.initialInput = null;
                    this.startTurn(initialInput);
                }
            } else if (requestMethod === 'turn/start') {
                const result = raw.result as Record<string, unknown> | undefined;
                const turn = result?.turn as Record<string, unknown> | undefined;
                this.currentTurnId = typeof turn?.id === 'string' ? turn.id : this.currentTurnId;
            } else if (requestMethod === 'turn/steer') {
                const result = raw.result as Record<string, unknown> | undefined;
                if (typeof result?.turnId === 'string') {
                    this.currentTurnId = result.turnId;
                }
            }

            return events;
        }

        const notificationEvents = parseCodexLine(trimmed, this.sessionId, this.connectorId);
        for (const event of notificationEvents) {
            if (event.type === 'session:started' && event.providerSessionId) {
                this.threadId = event.providerSessionId;
            } else if (event.type === 'session:completed' || event.type === 'session:failed') {
                this.currentTurnId = null;
            }
        }

        if (typeof raw.method === 'string' && raw.method === 'turn/started') {
            const turn = raw.params && typeof raw.params === 'object'
                ? (raw.params as Record<string, unknown>).turn as Record<string, unknown> | undefined
                : undefined;
            this.currentTurnId = typeof turn?.id === 'string' ? turn.id : this.currentTurnId;
        }

        return notificationEvents;
    }

    async sendInput(text: string): Promise<void> {
        this.resumeActiveTurn(text);
    }

    async approve(permissionId: string): Promise<void> {
        const requestId = this.pendingApprovalRequests.get(permissionId);
        if (requestId === undefined) {
            throw new Error(`Unknown approval request ${permissionId}`);
        }
        this.pendingApprovalRequests.delete(permissionId);
        this.sendResponse(requestId, 'accept');
        this.setStatus('active');
    }

    async deny(permissionId: string): Promise<void> {
        const requestId = this.pendingApprovalRequests.get(permissionId);
        if (requestId === undefined) {
            throw new Error(`Unknown approval request ${permissionId}`);
        }
        this.pendingApprovalRequests.delete(permissionId);
        this.sendResponse(requestId, 'decline');
        this.setStatus('active');
    }

    async cancel(): Promise<void> {
        this.setStatus('cancelled');
        if (this.threadId && this.currentTurnId) {
            try {
                this.sendRequest('turn/interrupt', { threadId: this.threadId, turnId: this.currentTurnId });
            } catch {
                // Fall through to process termination below.
            }
        }
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
        session.attach(child, input.repoPath, prompt);
        session.beginHandshake(
            input.forkSessionId ? 'fork' : input.resumeSessionId ? 'resume' : 'start',
            input.forkSessionId ?? input.resumeSessionId,
        );

        return session;
    }
}
