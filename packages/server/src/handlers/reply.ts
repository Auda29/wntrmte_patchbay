import { Orchestrator } from '@patchbay/core';
import { IncomingMessage, ServerResponse } from 'http';
import { readBody, sendJson } from '../utils';

export async function postReply(
    orchestrator: Orchestrator,
    request: IncomingMessage,
    response: ServerResponse
) {
    let body: unknown;
    try {
        body = await readBody(request);
    } catch {
        sendJson(response, 400, { error: 'Invalid JSON body' });
        return;
    }

    const { conversationId, message, runnerId } = body as Record<string, unknown>;
    if (typeof conversationId !== 'string' || typeof message !== 'string' || !conversationId || !message) {
        sendJson(response, 400, { error: 'Missing conversationId or message' });
        return;
    }

    try {
        const run = await orchestrator.continueConversation(
            conversationId,
            message,
            runnerId as string
        );
        sendJson(response, 200, run);
    } catch (error) {
        const err = error instanceof Error ? error : new Error('Internal error');
        sendJson(response, 500, { error: err.message });
    }
}
