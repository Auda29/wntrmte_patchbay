import type { AgentEvent } from '@patchbay/core';

// ---------------------------------------------------------------------------
// Claude Code stream-json NDJSON event types
//
// When invoked with `--output-format stream-json`, Claude Code emits one
// JSON object per line. The shapes below cover the events we map to
// provider-agnostic AgentEvents.
// ---------------------------------------------------------------------------

export interface StreamInit {
    type: 'system';
    subtype: 'init';
    session_id: string;
    [key: string]: unknown;
}

export interface StreamAssistantMessage {
    type: 'assistant';
    message: {
        id: string;
        content: Array<
            | { type: 'text'; text: string }
            | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
        >;
        stop_reason?: string;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export interface StreamToolResult {
    type: 'result';
    subtype: 'tool_result';
    tool_use_id: string;
    content: string;
    is_error?: boolean;
    [key: string]: unknown;
}

export interface StreamResult {
    type: 'result';
    subtype?: string;
    result?: string;
    cost_usd?: number;
    duration_ms?: number;
    session_id?: string;
    [key: string]: unknown;
}

export type StreamEvent = StreamInit | StreamAssistantMessage | StreamToolResult | StreamResult;

// ---------------------------------------------------------------------------
// Parser: NDJSON line -> AgentEvent[]
// ---------------------------------------------------------------------------

export function parseStreamLine(line: string, sessionId: string, connectorId: string): AgentEvent[] {
    const trimmed = line.trim();
    if (!trimmed) return [];

    let raw: Record<string, unknown>;
    try {
        raw = JSON.parse(trimmed);
    } catch {
        return [];
    }

    const now = new Date().toISOString();
    const events: AgentEvent[] = [];

    // --- system init ---
    if (raw.type === 'system' && raw.subtype === 'init') {
        events.push({
            type: 'session:started',
            sessionId,
            connectorId,
            timestamp: now,
        });
        return events;
    }

    // --- assistant message (may contain text + tool_use blocks) ---
    if (raw.type === 'assistant' && raw.message) {
        const msg = raw.message as StreamAssistantMessage['message'];
        for (const block of msg.content ?? []) {
            if (block.type === 'text') {
                events.push({
                    type: 'agent:message',
                    sessionId,
                    content: block.text,
                    timestamp: now,
                });
            } else if (block.type === 'tool_use') {
                events.push({
                    type: 'agent:tool_use',
                    sessionId,
                    toolName: block.name,
                    toolInput: block.input,
                    status: 'started',
                    timestamp: now,
                });
            }
        }
        return events;
    }

    // --- tool result ---
    if (raw.type === 'result' && raw.subtype === 'tool_result') {
        const tr = raw as StreamToolResult;
        events.push({
            type: 'agent:tool_use',
            sessionId,
            toolName: tr.tool_use_id,
            toolOutput: tr.content,
            status: tr.is_error ? 'failed' : 'completed',
            timestamp: now,
        });
        return events;
    }

    // --- final result ---
    if (raw.type === 'result' && raw.subtype !== 'tool_result') {
        const r = raw as StreamResult;
        events.push({
            type: 'session:completed',
            sessionId,
            summary: r.result,
            timestamp: now,
        });
        return events;
    }

    return events;
}
