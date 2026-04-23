import { describe, expect, it } from 'vitest';
import { extractProviderSessionId, parseCodexLine, parseCodexResponse } from './stream-parser';

describe('Codex stream parser', () => {
    it('extracts provider session id from thread lifecycle notifications', () => {
        const [event] = parseCodexLine(
            JSON.stringify({
                jsonrpc: '2.0',
                method: 'thread/started',
                params: { thread: { id: 'thread-abc' } },
            }),
            'session-1',
            'codex',
        );

        expect(event?.type).toBe('session:started');
        expect(event && 'providerSessionId' in event ? event.providerSessionId : undefined).toBe('thread-abc');
    });

    it('maps thread/start responses to session started with provider session id', () => {
        const [event] = parseCodexResponse(
            {
                jsonrpc: '2.0',
                id: 1,
                result: { thread: { id: 'thread-xyz' } },
            },
            'session-1',
            'codex',
            'thread/start',
        );

        expect(event?.type).toBe('session:started');
        expect(event && 'providerSessionId' in event ? event.providerSessionId : undefined).toBe('thread-xyz');
    });

    it('maps thread.fork responses to session started with provider session id', () => {
        const [event] = parseCodexResponse(
            {
                id: 2,
                result: { threadId: 'thread-forked' },
            },
            'session-1',
            'codex',
            'thread/fork',
        );

        expect(event?.type).toBe('session:started');
        expect(event && 'providerSessionId' in event ? event.providerSessionId : undefined).toBe('thread-forked');
    });

    it('extracts provider session id from top-level threadId payloads', () => {
        expect(extractProviderSessionId({ threadId: 'thread-top-level' })).toBe('thread-top-level');
    });

    it('maps JSON-RPC errors to failed session events', () => {
        const [event] = parseCodexResponse(
            {
                jsonrpc: '2.0',
                id: 1,
                error: { message: 'resume failed' },
            },
            'session-1',
            'codex',
            'thread/resume',
        );

        expect(event).toEqual(expect.objectContaining({
            type: 'session:failed',
            error: 'resume failed',
        }));
    });

    it('maps agent message deltas from item notifications', () => {
        const [event] = parseCodexLine(
            JSON.stringify({
                method: 'item/agentMessage/delta',
                params: { delta: 'Hello world' },
            }),
            'session-1',
            'codex',
        );

        expect(event).toEqual(expect.objectContaining({
            type: 'agent:message',
            content: 'Hello world',
            partial: true,
        }));
    });

    it('maps turn completion to a completed session event', () => {
        const [event] = parseCodexLine(
            JSON.stringify({
                method: 'turn/completed',
                params: { turn: { status: 'completed' } },
            }),
            'session-1',
            'codex',
        );

        expect(event).toEqual(expect.objectContaining({
            type: 'session:completed',
        }));
    });

    it('accepts thread.start responses without jsonrpc', () => {
        const [event] = parseCodexResponse(
            {
                id: 3,
                result: { thread: { id: 'thread-no-jsonrpc' } },
            },
            'session-1',
            'codex',
            'thread/start',
        );

        expect(event).toEqual(expect.objectContaining({
            type: 'session:started',
            providerSessionId: 'thread-no-jsonrpc',
        }));
    });

    it('accepts notifications without jsonrpc', () => {
        const [event] = parseCodexLine(
            JSON.stringify({
                method: 'thread/started',
                params: { thread: { id: 'thread-no-jsonrpc' } },
            }),
            'session-1',
            'codex',
        );

        expect(event).toEqual(expect.objectContaining({
            type: 'session:started',
            providerSessionId: 'thread-no-jsonrpc',
        }));
    });
});
