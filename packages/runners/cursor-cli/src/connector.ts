import {
    BaseConnector,
    BaseSession,
    RunnerInput,
    AgentSession,
    ConnectorCapabilities,
    buildPrompt,
} from '@patchbay/core';
import { spawn, ChildProcess } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { createInterface } from 'readline';
import { parseAcpLine } from './acp-parser';

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// ACP Connector Configuration
// ---------------------------------------------------------------------------

export interface AcpConnectorConfig {
    /** Unique connector ID (e.g. "cursor-acp", "my-agent-acp") */
    id: string;
    /** Display name (e.g. "Cursor (ACP)", "My Agent") */
    name: string;
    /** Command to spawn the ACP agent process */
    command: string;
    /** Arguments to pass to the command (e.g. ["agent", "acp"]) */
    args: string[];
    /** Command to check availability (e.g. "cursor --version"). If omitted, skips check. */
    versionCommand?: string;
    /** Environment variables to merge into the spawned process */
    env?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// ACP JSON-RPC helpers
// ---------------------------------------------------------------------------

let rpcIdCounter = 0;

function jsonRpcRequest(method: string, params: Record<string, unknown> = {}): string {
    return JSON.stringify({ jsonrpc: '2.0', id: ++rpcIdCounter, method, params });
}

function jsonRpcNotification(method: string, params: Record<string, unknown> = {}): string {
    return JSON.stringify({ jsonrpc: '2.0', method, params });
}

function jsonRpcResponse(id: number | string, result: Record<string, unknown> = {}): string {
    return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function jsonRpcErrorResponse(id: number | string, code: number, message: string): string {
    return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

// ---------------------------------------------------------------------------
// AcpSession — live session over ACP JSON-RPC/stdio
// ---------------------------------------------------------------------------

class AcpSession extends BaseSession {
    readonly sessionId: string;
    readonly connectorId: string;
    readonly taskId: string;

    private child: ChildProcess | null = null;
    private acpSessionId: string | null = null;
    private pendingPermissions = new Map<string, number | string>();
    private stderrChunks: string[] = [];

    constructor(sessionId: string, connectorId: string, taskId: string) {
        super();
        this.sessionId = sessionId;
        this.connectorId = connectorId;
        this.taskId = taskId;
    }

    attach(child: ChildProcess): void {
        this.child = child;
        this.setStatus('connecting');

        const rl = createInterface({ input: child.stdout! });

        rl.on('line', (line: string) => {
            const { events, pendingRequest } = parseAcpLine(line, this.sessionId, this.connectorId);

            if (pendingRequest) {
                if (pendingRequest.method === 'session/request_permission') {
                    const permId = String(pendingRequest.id);
                    this.pendingPermissions.set(permId, pendingRequest.id);
                    this.setStatus('awaiting_permission');
                } else if (pendingRequest.method.startsWith('fs/')) {
                    this.handleFsRequest(pendingRequest.id, pendingRequest.method, pendingRequest.params);
                } else if (pendingRequest.method.startsWith('terminal/')) {
                    this.write(jsonRpcErrorResponse(pendingRequest.id, -32601, 'Terminal operations not supported in Patchbay connector'));
                }
            }

            for (const event of events) {
                if (event.type === 'session:started') {
                    this.setStatus('active');
                } else if (event.type === 'agent:permission') {
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

    sendInitialize(): void {
        this.write(jsonRpcRequest('initialize', {
            protocolVersion: 1,
            clientCapabilities: {
                readTextFile: true,
                writeTextFile: true,
                terminal: false,
            },
            clientInfo: {
                name: 'patchbay',
                title: 'Patchbay Orchestrator',
                version: '0.1.0',
            },
        }));
    }

    sendSessionNew(): void {
        this.write(jsonRpcRequest('session/new', {}));
    }

    sendPrompt(text: string): void {
        this.write(jsonRpcRequest('session/prompt', {
            sessionId: this.acpSessionId,
            prompt: [{ type: 'text', text }],
        }));
    }

    setAcpSessionId(id: string): void {
        this.acpSessionId = id;
    }

    async sendInput(text: string): Promise<void> {
        this.sendPrompt(text);
        this.setStatus('active');
    }

    async approve(permissionId: string): Promise<void> {
        const rpcId = this.pendingPermissions.get(permissionId);
        if (rpcId !== undefined) {
            this.write(jsonRpcResponse(rpcId, { granted: true }));
            this.pendingPermissions.delete(permissionId);
        }
        this.setStatus('active');
    }

    async deny(permissionId: string): Promise<void> {
        const rpcId = this.pendingPermissions.get(permissionId);
        if (rpcId !== undefined) {
            this.write(jsonRpcResponse(rpcId, { granted: false }));
            this.pendingPermissions.delete(permissionId);
        }
        this.setStatus('active');
    }

    async cancel(): Promise<void> {
        if (this.child?.stdin?.writable) {
            this.write(jsonRpcNotification('session/cancel', {
                sessionId: this.acpSessionId,
            }));
        }
        this.setStatus('cancelled');
        setTimeout(() => {
            if (this.child) {
                this.child.kill();
                this.child = null;
            }
            this.emitClose();
        }, 1000);
    }

    private write(msg: string): void {
        if (this.child?.stdin?.writable) {
            this.child.stdin.write(msg + '\n');
        }
    }

    private handleFsRequest(id: number | string, method: string, params: Record<string, unknown>): void {
        const fs = require('fs');
        const filePath = params.path as string | undefined;

        if (method === 'fs/read_text_file' && filePath) {
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                this.write(jsonRpcResponse(id, { content }));
                this.emit({
                    type: 'agent:tool_use',
                    sessionId: this.sessionId,
                    toolName: method,
                    toolOutput: `Read ${filePath}`,
                    status: 'completed',
                    timestamp: new Date().toISOString(),
                });
            } catch (err: unknown) {
                this.write(jsonRpcErrorResponse(id, -32000, (err as Error).message));
                this.emit({
                    type: 'agent:tool_use',
                    sessionId: this.sessionId,
                    toolName: method,
                    toolOutput: (err as Error).message,
                    status: 'failed',
                    timestamp: new Date().toISOString(),
                });
            }
        } else if (method === 'fs/write_text_file' && filePath) {
            try {
                const content = params.content as string ?? '';
                fs.writeFileSync(filePath, content, 'utf-8');
                this.write(jsonRpcResponse(id, {}));
                this.emit({
                    type: 'agent:tool_use',
                    sessionId: this.sessionId,
                    toolName: method,
                    toolOutput: `Wrote ${filePath}`,
                    status: 'completed',
                    timestamp: new Date().toISOString(),
                });
            } catch (err: unknown) {
                this.write(jsonRpcErrorResponse(id, -32000, (err as Error).message));
                this.emit({
                    type: 'agent:tool_use',
                    sessionId: this.sessionId,
                    toolName: method,
                    toolOutput: (err as Error).message,
                    status: 'failed',
                    timestamp: new Date().toISOString(),
                });
            }
        } else {
            this.write(jsonRpcErrorResponse(id, -32601, `Unsupported fs method: ${method}`));
        }
    }
}

// ---------------------------------------------------------------------------
// AcpConnector — generic connector for any ACP-compliant agent
// ---------------------------------------------------------------------------

export class AcpConnector extends BaseConnector {
    readonly id: string;
    readonly name: string;
    readonly capabilities: ConnectorCapabilities = {
        streaming: true,
        permissions: true,
        multiTurn: true,
        toolUseReporting: true,
    };

    constructor(private readonly config: AcpConnectorConfig) {
        super();
        this.id = config.id;
        this.name = config.name;
    }

    async isAvailable(): Promise<boolean> {
        if (!this.config.versionCommand) return true;
        try {
            await execAsync(this.config.versionCommand);
            return true;
        } catch {
            return false;
        }
    }

    async connect(input: RunnerInput): Promise<AgentSession> {
        const sessionId = randomUUID();
        const prompt = buildPrompt(input);
        const isWin = process.platform === 'win32';

        const env = this.config.env
            ? { ...process.env, ...this.config.env }
            : process.env;

        const child = spawn(this.config.command, this.config.args, {
            cwd: input.repoPath,
            env,
            shell: isWin,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        const session = new AcpSession(sessionId, this.id, input.taskId);
        session.attach(child);

        // ACP initialization handshake → session/new → prompt
        session.sendInitialize();
        setTimeout(() => {
            session.sendSessionNew();
            setTimeout(() => {
                session.sendPrompt(prompt);
            }, 100);
        }, 100);

        return session;
    }
}

// ---------------------------------------------------------------------------
// Pre-configured ACP connectors for known agents
// ---------------------------------------------------------------------------

/** Cursor ACP connector — spawns `cursor agent acp` */
export class CursorAcpConnector extends AcpConnector {
    constructor() {
        super({
            id: 'cursor-acp',
            name: 'Cursor (ACP)',
            command: 'cursor',
            args: ['agent', 'acp'],
            versionCommand: 'cursor --version',
        });
    }
}
