import { describe, expect, it } from 'vitest';
import { parseCodexLine, parseCodexResponse } from './stream-parser';

describe('Codex stream parser', () => {
    it('extracts provider session id from thread lifecycle notifications', () => {
        const [event] = parseCodexLine(
            JSON.stringify({
                jsonrpc: '2.0',
                method: 'thread.created',
                params: { threadId: 'thread-abc' },
            }),
            'session-1',
            'codex',
        );

        expect(event?.type).toBe('session:started');
        expect(event && 'providerSessionId' in event ? event.providerSessionId : undefined).toBe('thread-abc');
    });

    it('maps thread.create responses to session started with provider session id', () => {
        const [event] = parseCodexResponse(
            {
                jsonrpc: '2.0',
                id: 1,
                result: { threadId: 'thread-xyz' },
            },
            'session-1',
            'codex',
            'thread.create',
        );

        expect(event?.type).toBe('session:started');
        expect(event && 'providerSessionId' in event ? event.providerSessionId : undefined).toBe('thread-xyz');
    });

    it('maps thread.fork responses to session started with provider session id', () => {
        const [event] = parseCodexResponse(
            {
                jsonrpc: '2.0',
                id: 2,
                result: { threadId: 'thread-forked' },
            },
            'session-1',
            'codex',
            'thread.fork',
        );

        expect(event?.type).toBe('session:started');
        expect(event && 'providerSessionId' in event ? event.providerSessionId : undefined).toBe('thread-forked');
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
            'thread.resume',
        );

        expect(event).toEqual(expect.objectContaining({
            type: 'session:failed',
            error: 'resume failed',
        }));
    });
});
