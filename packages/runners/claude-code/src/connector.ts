import {
    BaseConnector,
    BaseSession,
    RunnerInput,
    AgentSession,
    AgentEvent,
    ConnectorCapabilities,
    SessionStatus,
    buildPrompt,
} from '@patchbay/core';
import { spawn, ChildProcess } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { createInterface } from 'readline';
import { parseStreamLine } from './stream-parser';

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// ClaudeCodeSession — live session wrapping a `claude` child process
// ---------------------------------------------------------------------------

class ClaudeCodeSession extends BaseSession {
    readonly sessionId: string;
    readonly connectorId: string;
    readonly taskId: string;

    private child: ChildProcess | null = null;

    constructor(sessionId: string, connectorId: string, taskId: string) {
        super();
        this.sessionId = sessionId;
        this.connectorId = connectorId;
        this.taskId = taskId;
    }

    /** Attach to the spawned child process and start parsing NDJSON output */
    attach(child: ChildProcess): void {
        this.child = child;
        this.setStatus('active');

        const rl = createInterface({ input: child.stdout! });

        rl.on('line', (line: string) => {
            const events = parseStreamLine(line, this.sessionId, this.connectorId);
            for (const event of events) {
                // Track status changes based on events
                if (event.type === 'agent:question') {
                    this.setStatus('awaiting_input');
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
            // stderr lines are informational, not NDJSON — ignore silently
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
                    this.setStatus('failed');
                    this.emit({
                        type: 'session:failed',
                        sessionId: this.sessionId,
                        error: `Process exited with code ${code}`,
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
        const msg = JSON.stringify({ type: 'user', content: text });
        this.child.stdin.write(msg + '\n');
        this.setStatus('active');
    }

    async approve(permissionId: string): Promise<void> {
        if (!this.child?.stdin?.writable) {
            throw new Error('Session stdin is not writable');
        }
        const msg = JSON.stringify({ type: 'user', permission_response: 'allow', permission_id: permissionId });
        this.child.stdin.write(msg + '\n');
        this.setStatus('active');
    }

    async deny(permissionId: string): Promise<void> {
        if (!this.child?.stdin?.writable) {
            throw new Error('Session stdin is not writable');
        }
        const msg = JSON.stringify({ type: 'user', permission_response: 'deny', permission_id: permissionId });
        this.child.stdin.write(msg + '\n');
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
// ClaudeCodeConnector — spawns `claude` with stream-json I/O
// ---------------------------------------------------------------------------

export class ClaudeCodeConnector extends BaseConnector {
    readonly id = 'claude-code';
    readonly name = 'Claude Code';
    readonly capabilities: ConnectorCapabilities = {
        streaming: true,
        permissions: true,
        multiTurn: true,
        toolUseReporting: true,
    };

    async isAvailable(): Promise<boolean> {
        try {
            await execAsync('claude --version');
            return true;
        } catch {
            return false;
        }
    }

    async connect(input: RunnerInput): Promise<AgentSession> {
        const sessionId = input.resumeSessionId ?? randomUUID();
        const prompt = input.resumeSessionId ? input.goal : buildPrompt(input);
        const isWin = process.platform === 'win32';

        const args: string[] = [
            '--output-format', 'stream-json',
            '--input-format', 'stream-json',
            '--verbose',
        ];

        if (input.resumeSessionId) {
            args.push('--resume', input.resumeSessionId);
        } else {
            args.push('--session-id', sessionId);
        }

        const child = spawn('claude', args, {
            cwd: input.repoPath,
            env: process.env,
            shell: isWin,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        const session = new ClaudeCodeSession(sessionId, this.id, input.taskId);
        session.attach(child);

        // Send the initial prompt via stdin (stream-json input format)
        const initMessage = JSON.stringify({ type: 'user', content: prompt });
        child.stdin!.write(initMessage + '\n');

        return session;
    }
}
