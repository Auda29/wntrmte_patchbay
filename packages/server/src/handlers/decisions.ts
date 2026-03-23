import { Store } from '@patchbay/core';
import { IncomingMessage, ServerResponse } from 'http';
import { sendJson, readBody } from '../utils';

export function getDecisions(store: Store, response: ServerResponse) {
    sendJson(response, 200, store.listDecisions());
}

export async function postDecision(store: Store, request: IncomingMessage, response: ServerResponse) {
    let body: unknown;
    try {
        body = await readBody(request);
    } catch {
        sendJson(response, 400, { error: 'Invalid JSON body' });
        return;
    }

    const { title, rationale, proposedBy } = body as Record<string, unknown>;
    if (typeof title !== 'string' || !title || typeof rationale !== 'string' || !rationale) {
        sendJson(response, 400, { error: 'Missing title or rationale' });
        return;
    }

    try {
        const decision = store.createDecision(title, rationale, typeof proposedBy === 'string' ? proposedBy : undefined);
        sendJson(response, 201, decision);
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Internal error';
        sendJson(response, 500, { error: msg });
    }
}
