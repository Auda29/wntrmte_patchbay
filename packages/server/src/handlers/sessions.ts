import { Store } from '@patchbay/core';
import { ServerResponse } from 'http';
import { sendJson } from '../utils';

export function getSessions(store: Store, response: ServerResponse, taskId?: string) {
    sendJson(response, 200, store.listSessions(taskId));
}

export function getSession(store: Store, response: ServerResponse, sessionId: string) {
    const session = store.getSession(sessionId);
    if (!session) {
        sendJson(response, 404, { error: `Session ${sessionId} not found` });
        return;
    }

    sendJson(response, 200, session);
}

export function getSessionEvents(store: Store, response: ServerResponse, sessionId: string) {
    if (!store.getSession(sessionId)) {
        sendJson(response, 404, { error: `Session ${sessionId} not found` });
        return;
    }

    sendJson(response, 200, store.listSessionEvents(sessionId));
}
