import { Store } from '@patchbay/core';
import { IncomingMessage, ServerResponse } from 'http';
import { sendJson, readBody } from '../utils';

const VALID_STATUSES = ['open', 'in_progress', 'blocked', 'review', 'done'] as const;

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

export async function postTask(store: Store, request: IncomingMessage, response: ServerResponse) {
    let body: unknown;
    try {
        body = await readBody(request);
    } catch {
        sendJson(response, 400, { error: 'Invalid JSON body' });
        return;
    }

    const { title, goal, affectedFiles } = body as Record<string, unknown>;
    if (typeof title !== 'string' || !title) {
        sendJson(response, 400, { error: 'Missing title' });
        return;
    }

    try {
        const task = store.createTask(title, typeof goal === 'string' ? goal : '', affectedFiles as string[] | undefined);
        sendJson(response, 201, task);
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Internal error';
        sendJson(response, 500, { error: msg });
    }
}

export async function patchTask(store: Store, request: IncomingMessage, response: ServerResponse, id: string) {
    let body: unknown;
    try {
        body = await readBody(request);
    } catch {
        sendJson(response, 400, { error: 'Invalid JSON body' });
        return;
    }

    const { status } = body as Record<string, unknown>;
    if (typeof status !== 'string') {
        sendJson(response, 400, { error: 'Missing status' });
        return;
    }
    if (!(VALID_STATUSES as readonly string[]).includes(status)) {
        sendJson(response, 400, { error: `Invalid status: ${status}` });
        return;
    }

    const task = store.getTask(id);
    if (!task) {
        sendJson(response, 404, { error: `Task '${id}' not found` });
        return;
    }

    try {
        const updated = { ...task, status: status as typeof VALID_STATUSES[number] };
        store.saveTask(updated);
        sendJson(response, 200, updated);
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Internal error';
        sendJson(response, 500, { error: msg });
    }
}
