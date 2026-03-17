import { Store } from '@patchbay/core';
import { ServerResponse } from 'http';
import { sendJson } from '../utils';

export function getRuns(store: Store, response: ServerResponse, taskId?: string) {
    sendJson(response, 200, store.listRuns(taskId));
}
