import { Orchestrator } from '@patchbay/core';
import { IncomingMessage, ServerResponse } from 'http';
import { sendJson, readBody } from '../utils';

export async function postDispatch(
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

    const { taskId, runnerId } = body as Record<string, unknown>;
    if (typeof taskId !== 'string' || typeof runnerId !== 'string') {
        sendJson(response, 400, { error: 'Missing or invalid taskId / runnerId' });
        return;
    }

    try {
        const run = await orchestrator.dispatchTask(taskId, runnerId);
        sendJson(response, 200, run);
    } catch (error) {
        const err = error instanceof Error ? error : new Error('Internal error');
        sendJson(response, 500, { error: err.message });
    }
}
