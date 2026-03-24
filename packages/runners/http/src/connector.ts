import {
    BaseConnector,
    BaseSession,
    RunnerInput,
    AgentSession,
    AgentEvent,
    ConnectorCapabilities,
} from '@patchbay/core';
import { randomUUID } from 'crypto';
import { buildPrompt } from '@patchbay/core';

// ---------------------------------------------------------------------------
// Configuration for the HTTP connector endpoint
// ---------------------------------------------------------------------------

export interface HttpConnectorConfig {
    /** Base URL of the OpenAI-compatible API (e.g. "http://localhost:11434/v1") */
    baseUrl: string;
    /** API key (optional for local backends like Ollama) */
    apiKey?: string;
    /** Model identifier (e.g. "llama3", "gpt-4o", "deepseek-coder") */
    model: string;
    /** Whether the endpoint supports SSE streaming (default: true) */
    streaming?: boolean;
}

// ---------------------------------------------------------------------------
// SSE line parser — handles `data: {...}` lines from streaming responses
// ---------------------------------------------------------------------------

function parseSseLine(line: string, sessionId: string, connectorId: string): AgentEvent | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data: ')) return null;

    const data = trimmed.slice(6);
    if (data === '[DONE]') {
        return {
            type: 'session:completed',
            sessionId,
            timestamp: new Date().toISOString(),
        };
    }

    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(data);
    } catch {
        return null;
    }

    const choices = parsed.choices as Array<Record<string, unknown>> | undefined;
    if (!choices?.length) return null;

    const choice = choices[0];
    const delta = choice.delta as Record<string, unknown> | undefined;
    const content = (delta?.content ?? '') as string;

    if (content) {
        return {
            type: 'agent:message',
            sessionId,
            content,
            partial: true,
            timestamp: new Date().toISOString(),
        };
    }

    // Tool call delta
    const toolCalls = delta?.tool_calls as Array<Record<string, unknown>> | undefined;
    if (toolCalls?.length) {
        const tc = toolCalls[0];
        const fn = tc.function as Record<string, unknown> | undefined;
        if (fn?.name) {
            return {
                type: 'agent:tool_use',
                sessionId,
                toolName: fn.name as string,
                toolInput: fn.arguments ? tryParseJson(fn.arguments as string) : undefined,
                status: 'started',
                timestamp: new Date().toISOString(),
            };
        }
    }

    return null;
}

function tryParseJson(s: string): Record<string, unknown> | undefined {
    try {
        return JSON.parse(s);
    } catch {
        return undefined;
    }
}

// ---------------------------------------------------------------------------
// HttpSession — manages a streaming or non-streaming chat completion
// ---------------------------------------------------------------------------

class HttpSession extends BaseSession {
    readonly sessionId: string;
    readonly connectorId: string;
    readonly taskId: string;

    private messages: Array<{ role: string; content: string }> = [];
    private abortController: AbortController | null = null;

    constructor(
        sessionId: string,
        connectorId: string,
        taskId: string,
        private readonly config: HttpConnectorConfig,
    ) {
        super();
        this.sessionId = sessionId;
        this.connectorId = connectorId;
        this.taskId = taskId;
    }

    /** Run an initial or follow-up completion request */
    async runCompletion(systemPrompt: string | undefined, userMessage: string): Promise<void> {
        if (systemPrompt && this.messages.length === 0) {
            this.messages.push({ role: 'system', content: systemPrompt });
        }
        this.messages.push({ role: 'user', content: userMessage });

        this.setStatus('active');
        this.abortController = new AbortController();

        const useStreaming = this.config.streaming !== false;
        const url = `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (this.config.apiKey) {
            headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }

        const body = JSON.stringify({
            model: this.config.model,
            messages: this.messages,
            stream: useStreaming,
        });

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body,
                signal: this.abortController.signal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                this.setStatus('failed');
                this.emit({
                    type: 'session:failed',
                    sessionId: this.sessionId,
                    error: `HTTP ${response.status}: ${errorText}`,
                    timestamp: new Date().toISOString(),
                });
                this.emitClose();
                return;
            }

            if (useStreaming && response.body) {
                await this.handleStream(response.body);
            } else {
                await this.handleNonStream(response);
            }
        } catch (err: unknown) {
            if ((err as Error).name === 'AbortError') return;
            this.setStatus('failed');
            this.emit({
                type: 'session:failed',
                sessionId: this.sessionId,
                error: (err as Error).message,
                timestamp: new Date().toISOString(),
            });
            this.emitClose();
        }
    }

    private async handleStream(body: ReadableStream<Uint8Array>): Promise<void> {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const fullContent: string[] = [];

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';

                for (const line of lines) {
                    const event = parseSseLine(line, this.sessionId, this.connectorId);
                    if (event) {
                        if (event.type === 'agent:message' && 'content' in event) {
                            fullContent.push(event.content);
                        }
                        this.emit(event);
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        // Track the assistant response for multi-turn
        if (fullContent.length) {
            this.messages.push({ role: 'assistant', content: fullContent.join('') });
        }

        if (this.status === 'active') {
            this.setStatus('completed');
            this.emit({
                type: 'session:completed',
                sessionId: this.sessionId,
                summary: fullContent.join('').slice(0, 200) || undefined,
                timestamp: new Date().toISOString(),
            });
            this.emitClose();
        }
    }

    private async handleNonStream(response: Response): Promise<void> {
        const json = await response.json() as Record<string, unknown>;
        const choices = json.choices as Array<Record<string, unknown>> | undefined;
        const content = (choices?.[0]?.message as Record<string, unknown>)?.content as string ?? '';

        if (content) {
            this.messages.push({ role: 'assistant', content });
            this.emit({
                type: 'agent:message',
                sessionId: this.sessionId,
                content,
                partial: false,
                timestamp: new Date().toISOString(),
            });
        }

        this.setStatus('completed');
        this.emit({
            type: 'session:completed',
            sessionId: this.sessionId,
            summary: content.slice(0, 200) || undefined,
            timestamp: new Date().toISOString(),
        });
        this.emitClose();
    }

    async sendInput(text: string): Promise<void> {
        await this.runCompletion(undefined, text);
    }

    async approve(_permissionId: string): Promise<void> {
        // HTTP API connectors don't have permission flows
    }

    async deny(_permissionId: string): Promise<void> {
        // HTTP API connectors don't have permission flows
    }

    async cancel(): Promise<void> {
        this.setStatus('cancelled');
        this.abortController?.abort();
        this.abortController = null;
        this.emitClose();
    }
}

// ---------------------------------------------------------------------------
// HttpConnector — OpenAI-compatible chat/completions API connector
// ---------------------------------------------------------------------------

export class HttpConnector extends BaseConnector {
    readonly id: string;
    readonly name: string;
    readonly capabilities: ConnectorCapabilities;

    constructor(private readonly config: HttpConnectorConfig, idOverride?: string) {
        super();
        this.id = idOverride ?? `http-${config.model}`;
        this.name = `HTTP (${config.model})`;
        this.capabilities = {
            streaming: config.streaming !== false,
            permissions: false,
            multiTurn: true,
            toolUseReporting: false,
        };
    }

    async isAvailable(): Promise<boolean> {
        try {
            const url = `${this.config.baseUrl.replace(/\/+$/, '')}/models`;
            const headers: Record<string, string> = {};
            if (this.config.apiKey) {
                headers['Authorization'] = `Bearer ${this.config.apiKey}`;
            }
            const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
            return res.ok;
        } catch {
            return false;
        }
    }

    async connect(input: RunnerInput): Promise<AgentSession> {
        const sessionId = input.sessionId ?? randomUUID();
        const prompt = buildPrompt(input);

        const session = new HttpSession(sessionId, this.id, input.taskId, this.config);

        // Start the first completion asynchronously
        session.runCompletion(input.projectRules ?? undefined, prompt);

        return session;
    }
}
