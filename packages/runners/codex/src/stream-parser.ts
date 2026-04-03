import type { AgentEvent } from '@patchbay/core';

// ---------------------------------------------------------------------------
// Codex app-server JSON-RPC / JSONL event types
//
// `codex app-server` communicates via JSON-RPC over stdio. It emits
// notifications (no id) for streaming events. The shapes below cover
// the notifications we map to provider-agnostic AgentEvents.
//
// Reference: https://developers.openai.com/codex/app-server
// ---------------------------------------------------------------------------

export interface JsonRpcNotification {
    jsonrpc?: '2.0';
    method: string;
    params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
    jsonrpc?: '2.0';
    id: number | string;
    result?: Record<string, unknown>;
    error?: {
        code?: number;
        message?: string;
        data?: unknown;
    };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

function stringifyValue(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim()) {
        return value;
    }
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    try {
        return JSON.stringify(value);
    } catch {
        return undefined;
    }
}

function getToolName(item?: Record<string, unknown>): string {
    if (!item) {
        return 'unknown';
    }

    if (typeof item.tool === 'string' && item.tool.trim()) {
        if (typeof item.server === 'string' && item.server.trim()) {
            return `${item.server}/${item.tool}`;
        }
        return item.tool;
    }

    if (typeof item.command === 'string' && item.command.trim()) {
        return item.command;
    }

    return 'unknown';
}

function extractProviderSessionId(payload?: Record<string, unknown>): string | undefined {
    if (!payload) return undefined;

    const directId = payload.threadId ?? payload.thread_id ?? payload.sessionId ?? payload.session_id ?? payload.id;
    if (typeof directId === 'string' && directId.trim()) {
        return directId;
    }

    const thread = payload.thread as Record<string, unknown> | undefined;
    const threadId = thread?.id ?? thread?.threadId ?? thread?.thread_id;
    if (typeof threadId === 'string' && threadId.trim()) {
        return threadId;
    }

    const session = payload.session as Record<string, unknown> | undefined;
    const sessionId = session?.id ?? session?.sessionId ?? session?.session_id;
    if (typeof sessionId === 'string' && sessionId.trim()) {
        return sessionId;
    }

    return undefined;
}

// ---------------------------------------------------------------------------
// Parser: JSON-RPC notification line -> AgentEvent[]
// ---------------------------------------------------------------------------

export function parseCodexResponse(
    raw: JsonRpcResponse,
    sessionId: string,
    connectorId: string,
    requestMethod?: string,
): AgentEvent[] {
    const now = new Date().toISOString();

    if (raw.error) {
        return [{
            type: 'session:failed',
            sessionId,
            error: raw.error.message ?? 'Codex app-server request failed',
            timestamp: now,
        }];
    }

    if (requestMethod === 'thread/start' || requestMethod === 'thread/resume' || requestMethod === 'thread/fork') {
        return [{
            type: 'session:started',
            sessionId,
            connectorId,
            providerSessionId: extractProviderSessionId(raw.result),
            timestamp: now,
        }];
    }

    return [];
}

export function parseCodexLine(line: string, sessionId: string, connectorId: string): AgentEvent[] {
    const trimmed = line.trim();
    if (!trimmed) return [];

    let raw: Record<string, unknown>;
    try {
        raw = JSON.parse(trimmed);
    } catch {
        return [];
    }

    // Codex app-server may omit the `jsonrpc` field on stdout notifications.
    if (!raw.method || raw.id !== undefined) return [];

    const now = new Date().toISOString();
    const params = (raw.params ?? {}) as Record<string, unknown>;
    const item = asRecord(params.item);
    const events: AgentEvent[] = [];

    switch (raw.method) {
        // --- session lifecycle ---
        case 'thread/started':
            events.push({
                type: 'session:started',
                sessionId,
                connectorId,
                providerSessionId: extractProviderSessionId(params),
                timestamp: now,
            });
            break;

        // --- assistant text ---
        case 'item/agentMessage/delta': {
            const content = stringifyValue(
                params.delta
                ?? params.textDelta
                ?? params.text
                ?? params.content
                ?? asRecord(params.delta)?.text
            );
            if (content) {
                events.push({
                    type: 'agent:message',
                    sessionId,
                    content,
                    partial: true,
                    timestamp: now,
                });
            }
            break;
        }

        case 'item/completed': {
            const itemType = item?.type;
            if (itemType === 'agentMessage') {
                const content = stringifyValue(item?.text ?? item?.content ?? params.text ?? params.content);
                if (content) {
                    events.push({
                        type: 'agent:message',
                        sessionId,
                        content,
                        partial: false,
                        timestamp: now,
                    });
                }
                break;
            }

            if (itemType === 'commandExecution' || itemType === 'mcpToolCall' || itemType === 'dynamicToolCall') {
                const status = item?.status === 'failed' || item?.status === 'declined' ? 'failed' : 'completed';
                const toolName = getToolName(item);
                const toolOutput = stringifyValue(
                    item?.aggregatedOutput
                    ?? item?.result
                    ?? asRecord(item?.error)?.message
                    ?? item?.error
                    ?? item?.contentItems
                );

                events.push({
                    type: 'agent:tool_use',
                    sessionId,
                    toolName,
                    toolOutput,
                    status,
                    timestamp: now,
                });
                break;
            }
            break;
        }

        case 'item/started': {
            const itemType = item?.type;
            if (itemType === 'commandExecution' || itemType === 'mcpToolCall' || itemType === 'dynamicToolCall') {
                const toolName = getToolName(item);
                const toolInput = asRecord(item?.arguments);

                events.push({
                    type: 'agent:tool_use',
                    sessionId,
                    toolName,
                    toolInput,
                    status: 'started',
                    timestamp: now,
                });
            }
            break;
        }

        // --- session end ---
        case 'turn/completed': {
            const turn = asRecord(params.turn);
            const turnStatus = turn?.status;
            if (turnStatus === 'failed') {
                const error = stringifyValue(
                    asRecord(turn?.error)?.message
                    ?? turn?.error
                    ?? params.error
                ) ?? 'Turn failed';
                events.push({
                    type: 'session:failed',
                    sessionId,
                    error,
                    timestamp: now,
                });
                break;
            }

            if (turnStatus === 'completed' || turnStatus === 'interrupted') {
                events.push({
                    type: 'session:completed',
                    sessionId,
                    summary: stringifyValue(turn?.result ?? turn?.summary),
                    timestamp: now,
                });
            }
            break;
        }
    }

    return events;
}
