import type { AgentEvent } from '@patchbay/core';

// ---------------------------------------------------------------------------
// Gemini CLI headless / JSON output parser
//
// Gemini CLI in headless mode emits JSON lines on stdout. The exact
// schema depends on the CLI version; we handle known shapes and
// gracefully ignore unknown ones.
// ---------------------------------------------------------------------------

export function parseGeminiLine(line: string, sessionId: string, connectorId: string): AgentEvent[] {
    const trimmed = line.trim();
    if (!trimmed) return [];

    let raw: Record<string, unknown>;
    try {
        raw = JSON.parse(trimmed);
    } catch {
        // Plain text output — treat as a message fragment
        return [{
            type: 'agent:message',
            sessionId,
            content: trimmed,
            partial: true,
            timestamp: new Date().toISOString(),
        }];
    }

    const now = new Date().toISOString();
    const events: AgentEvent[] = [];
    const eventType = (raw.type ?? raw.event) as string | undefined;

    switch (eventType) {
        // --- session lifecycle ---
        case 'session_start':
        case 'init':
            events.push({
                type: 'session:started',
                sessionId,
                connectorId,
                timestamp: now,
            });
            break;

        // --- text output ---
        case 'text_delta':
        case 'content_delta':
        case 'delta': {
            const content = (raw.text ?? raw.content ?? raw.delta ?? '') as string;
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

        case 'text':
        case 'content':
        case 'message': {
            const content = (raw.text ?? raw.content ?? raw.message ?? '') as string;
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
        case 'tool_call':
        case 'function_call': {
            events.push({
                type: 'agent:tool_use',
                sessionId,
                toolName: (raw.name ?? raw.tool ?? 'unknown') as string,
                toolInput: raw.args as Record<string, unknown> | undefined,
                status: 'started',
                timestamp: now,
            });
            break;
        }

        case 'tool_result':
        case 'function_result': {
            events.push({
                type: 'agent:tool_use',
                sessionId,
                toolName: (raw.name ?? raw.tool ?? 'unknown') as string,
                toolOutput: (raw.output ?? raw.result ?? '') as string,
                status: (raw.error ? 'failed' : 'completed') as 'completed' | 'failed',
                timestamp: now,
            });
            break;
        }

        // --- completion ---
        case 'done':
        case 'complete':
        case 'session_end': {
            events.push({
                type: 'session:completed',
                sessionId,
                summary: (raw.summary ?? raw.result) as string | undefined,
                timestamp: now,
            });
            break;
        }

        case 'error': {
            events.push({
                type: 'session:failed',
                sessionId,
                error: (raw.error ?? raw.message ?? 'Unknown error') as string,
                timestamp: now,
            });
            break;
        }

        default: {
            // Unknown structured event — if it has text content, emit as message
            const fallbackContent = (raw.text ?? raw.content ?? raw.message) as string | undefined;
            if (fallbackContent) {
                events.push({
                    type: 'agent:message',
                    sessionId,
                    content: fallbackContent,
                    partial: false,
                    timestamp: now,
                });
            }
            break;
        }
    }

    return events;
}
