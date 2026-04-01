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
    jsonrpc: '2.0';
    method: string;
    params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: number | string;
    result?: Record<string, unknown>;
    error?: {
        code?: number;
        message?: string;
        data?: unknown;
    };
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

    if (requestMethod === 'thread.create' || requestMethod === 'thread.resume' || requestMethod === 'thread.fork') {
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

    // Only handle JSON-RPC notifications (no "id" field)
    if (raw.jsonrpc !== '2.0' || !raw.method || raw.id !== undefined) return [];

    const now = new Date().toISOString();
    const params = (raw.params ?? {}) as Record<string, unknown>;
    const events: AgentEvent[] = [];

    switch (raw.method) {
        // --- session lifecycle ---
        case 'thread.created':
        case 'session.created':
            events.push({
                type: 'session:started',
                sessionId,
                connectorId,
                providerSessionId: extractProviderSessionId(params),
                timestamp: now,
            });
            break;

        // --- assistant text ---
        case 'thread.message.delta':
        case 'message.delta': {
            const delta = params.delta as Record<string, unknown> | undefined;
            const content = (delta?.content ?? delta?.text ?? params.content ?? params.text ?? '') as string;
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

        case 'thread.message.completed':
        case 'message.completed': {
            const message = params.message as Record<string, unknown> | undefined;
            const content = (message?.content ?? params.content ?? params.text ?? '') as string;
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

        // --- tool use ---
        case 'tool.call.started':
        case 'function.call.started': {
            events.push({
                type: 'agent:tool_use',
                sessionId,
                toolName: (params.name ?? params.tool ?? 'unknown') as string,
                toolInput: params.arguments as Record<string, unknown> | undefined,
                status: 'started',
                timestamp: now,
            });
            break;
        }

        case 'tool.call.completed':
        case 'function.call.completed': {
            events.push({
                type: 'agent:tool_use',
                sessionId,
                toolName: (params.name ?? params.tool ?? 'unknown') as string,
                toolOutput: (params.output ?? params.result ?? '') as string,
                status: (params.error ? 'failed' : 'completed') as 'completed' | 'failed',
                timestamp: now,
            });
            break;
        }

        // --- approval / permission ---
        case 'approval.requested':
        case 'permission.requested': {
            events.push({
                type: 'agent:permission',
                sessionId,
                description: (params.description ?? params.message ?? 'Approval requested') as string,
                permissionId: (params.id ?? params.approval_id ?? '') as string,
                toolName: params.tool as string | undefined,
                timestamp: now,
            });
            break;
        }

        // --- session end ---
        case 'thread.completed':
        case 'session.completed': {
            events.push({
                type: 'session:completed',
                sessionId,
                summary: (params.summary ?? params.result) as string | undefined,
                timestamp: now,
            });
            break;
        }

        case 'thread.failed':
        case 'session.failed': {
            events.push({
                type: 'session:failed',
                sessionId,
                error: (params.error ?? params.message ?? 'Session failed') as string,
                timestamp: now,
            });
            break;
        }
    }

    return events;
}
