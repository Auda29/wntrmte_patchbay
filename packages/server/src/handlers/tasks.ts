import { Store } from '@patchbay/core';
import { ServerResponse } from 'http';
import { sendJson } from '../utils';

export function getTasks(store: Store, response: ServerResponse) {
    sendJson(response, 200, store.listTasks());
}

export function getTask(store: Store, response: ServerResponse, id: string) {
    const task = store.getTask(id);
    if (!task) {
        sendJson(response, 404, { error: `Task '${id}' not found` });
        return;
    }
    sendJson(response, 200, task);
}
