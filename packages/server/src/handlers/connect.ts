import { Orchestrator } from '@patchbay/core';
import { IncomingMessage, ServerResponse } from 'http';
import { sendJson, readBody } from '../utils';

export async function postConnect(
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

    const { taskId, connectorId } = body as Record<string, unknown>;
    if (typeof taskId !== 'string' || typeof connectorId !== 'string') {
        sendJson(response, 400, { error: 'Missing or invalid taskId / connectorId' });
        return;
    }

    try {
        const session = await orchestrator.connectAgent(taskId, connectorId);
        sendJson(response, 202, { sessionId: session.sessionId, connectorId: session.connectorId });
    } catch (error) {
        const err = error instanceof Error ? error : new Error('Internal error');
        sendJson(response, 500, { error: err.message });
    }
}
