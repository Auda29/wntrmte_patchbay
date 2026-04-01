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

    const { taskId, connectorId, mode, sessionId } = body as Record<string, unknown>;
    if (typeof taskId !== 'string' || typeof connectorId !== 'string') {
        sendJson(response, 400, { error: 'Missing or invalid taskId / connectorId' });
        return;
    }
    if (mode !== undefined && mode !== 'default' && mode !== 'resume' && mode !== 'fork') {
        sendJson(response, 400, { error: 'Invalid mode. Expected default | resume | fork' });
        return;
    }
    if (sessionId !== undefined && typeof sessionId !== 'string') {
        sendJson(response, 400, { error: 'Invalid sessionId' });
        return;
    }

    try {
        const session = await orchestrator.connectAgent(taskId, connectorId, {
            mode: (mode as 'default' | 'resume' | 'fork' | undefined) ?? 'default',
            sessionId: sessionId as string | undefined,
        });
        sendJson(response, 202, { sessionId: session.sessionId, connectorId: session.connectorId });
    } catch (error) {
        const err = error instanceof Error ? error : new Error('Internal error');
        sendJson(response, 500, { error: err.message });
    }
}
