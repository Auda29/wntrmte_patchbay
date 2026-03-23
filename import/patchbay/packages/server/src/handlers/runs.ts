import { Store } from '@patchbay/core';
import { IncomingMessage, ServerResponse } from 'http';
import { sendJson, readBody } from '../utils';

export function getRuns(store: Store, response: ServerResponse, taskId?: string) {
    sendJson(response, 200, store.listRuns(taskId));
}

export async function postRun(store: Store, request: IncomingMessage, response: ServerResponse) {
    let body: unknown;
    try {
        body = await readBody(request);
    } catch {
        sendJson(response, 400, { error: 'Invalid JSON body' });
        return;
    }

    const run = body as Record<string, unknown>;
    if (!run.taskId || !run.runner || !run.status || !run.startTime) {
        sendJson(response, 400, { error: 'Missing required fields: taskId, runner, status, startTime' });
        return;
    }

    try {
        store.saveRun(run as unknown as Parameters<Store['saveRun']>[0]);
        sendJson(response, 201, run);
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Internal error';
        sendJson(response, 500, { error: msg });
    }
}
