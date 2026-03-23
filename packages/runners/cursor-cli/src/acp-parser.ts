import type { AgentEvent } from '@patchbay/core';

// ---------------------------------------------------------------------------
// ACP (Agent Client Protocol) JSON-RPC message types
//
// ACP uses JSON-RPC 2.0 over stdio. Messages are either:
// - Responses (have "id" + "result"/"error") — replies to client requests
// - Notifications (have "method", no "id") — one-way from agent to client
// - Requests (have "method" + "id") — agent requesting something from client
//
// Reference: https://agentclientprotocol.com
// ---------------------------------------------------------------------------

export interface AcpJsonRpcMessage {
    jsonrpc: '2.0';
    id?: number | string;
    method?: string;
    params?: Record<string, unknown>;
    result?: Record<string, unknown>;
    error?: { code: number; message: string; data?: unknown };
}

// ---------------------------------------------------------------------------
// Content block extraction helpers
// ---------------------------------------------------------------------------

function extractTextFromContentBlocks(blocks: unknown): string {
    if (!Array.isArray(blocks)) return '';
    return blocks
        .filter((b: Record<string, unknown>) => b.type === 'text' && typeof b.text === 'string')
        .map((b: Record<string, unknown>) => b.text as string)
        .join('');
}

// ---------------------------------------------------------------------------
// Parser: JSON-RPC line -> AgentEvent[] + pending requests
// ---------------------------------------------------------------------------

export interface AcpParseResult {
    events: AgentEvent[];
    /** If the agent sent a JSON-RPC request (has "id"), we need to respond */
    pendingRequest?: {
        id: number | string;
        method: string;
        params: Record<string, unknown>;
    };
}

export function parseAcpLine(line: string, sessionId: string, connectorId: string): AcpParseResult {
    const trimmed = line.trim();
    if (!trimmed) return { events: [] };

    let raw: AcpJsonRpcMessage;
    try {
        raw = JSON.parse(trimmed);
    } catch {
        return { events: [] };
    }

    if (raw.jsonrpc !== '2.0') return { events: [] };

    const now = new Date().toISOString();
    const events: AgentEvent[] = [];
    let pendingRequest: AcpParseResult['pendingRequest'];

    // --- Response to our initialize request ---
    if (raw.id !== undefined && raw.result && !raw.method) {
        // Check if this is an initialize response (has agentCapabilities)
        if (raw.result.agentCapabilities || raw.result.protocolVersion) {
            events.push({
                type: 'session:started',
                sessionId,
                connectorId,
                timestamp: now,
            });
        }
        return { events };
    }

    // --- Error response ---
    if (raw.id !== undefined && raw.error) {
        events.push({
            type: 'session:failed',
            sessionId,
            error: raw.error.message,
            timestamp: now,
        });
        return { events };
    }

    // --- Agent request: session/request_permission ---
    if (raw.method === 'session/request_permission' && raw.id !== undefined) {
        const params = raw.params ?? {};
        events.push({
            type: 'agent:permission',
            sessionId,
            description: (params.description ?? params.message ?? 'Permission requested') as string,
            permissionId: String(raw.id),
            toolName: params.toolName as string | undefined,
            timestamp: now,
        });
        pendingRequest = {
            id: raw.id,
            method: raw.method,
            params,
        };
        return { events, pendingRequest };
    }

    // --- Agent request: fs/read_text_file, fs/write_text_file ---
    if (raw.method?.startsWith('fs/') && raw.id !== undefined) {
        const params = raw.params ?? {};
        events.push({
            type: 'agent:tool_use',
            sessionId,
            toolName: raw.method,
            toolInput: params,
            status: 'started',
            timestamp: now,
        });
        pendingRequest = {
            id: raw.id,
            method: raw.method,
            params,
        };
        return { events, pendingRequest };
    }

    // --- Agent request: terminal/* ---
    if (raw.method?.startsWith('terminal/') && raw.id !== undefined) {
        const params = raw.params ?? {};
        events.push({
            type: 'agent:tool_use',
            sessionId,
            toolName: raw.method,
            toolInput: params,
            status: 'started',
            timestamp: now,
        });
        pendingRequest = {
            id: raw.id,
            method: raw.method,
            params,
        };
        return { events, pendingRequest };
    }

    // --- Notification: session/update ---
    if (raw.method === 'session/update') {
        const params = raw.params ?? {};

        // Tool call update
        if (params.toolCallId) {
            const status = params.status as string | undefined;
            if (status === 'completed') {
                events.push({
                    type: 'agent:tool_use',
                    sessionId,
                    toolName: (params.toolName ?? params.toolCallId ?? 'unknown') as string,
                    toolOutput: extractTextFromContentBlocks(params.content) || undefined,
                    status: 'completed',
                    timestamp: now,
                });
            } else {
                // pending or in_progress
                events.push({
                    type: 'agent:tool_use',
                    sessionId,
                    toolName: (params.toolName ?? params.toolCallId ?? 'unknown') as string,
                    toolInput: params.input as Record<string, unknown> | undefined,
                    status: 'started',
                    timestamp: now,
                });
            }
            return { events };
        }

        // Stop reason → session end
        const stopReason = params.stopReason ?? params.stop_reason;
        if (stopReason) {
            if (stopReason === 'end_turn' || stopReason === 'max_tokens' || stopReason === 'max_turn_requests') {
                const summary = extractTextFromContentBlocks(params.content) || undefined;
                events.push({
                    type: 'session:completed',
                    sessionId,
                    summary,
                    timestamp: now,
                });
            } else if (stopReason === 'cancelled') {
                events.push({
                    type: 'session:completed',
                    sessionId,
                    summary: 'Session cancelled.',
                    timestamp: now,
                });
            } else {
                // refusal or unknown
                events.push({
                    type: 'session:failed',
                    sessionId,
                    error: `Agent stopped: ${stopReason}`,
                    timestamp: now,
                });
            }
            return { events };
        }

        // Content update (streaming text)
        const content = extractTextFromContentBlocks(params.content);
        if (content) {
            events.push({
                type: 'agent:message',
                sessionId,
                content,
                partial: true,
                timestamp: now,
            });
        }

        return { events };
    }

    return { events };
}
