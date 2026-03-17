import { Store } from '@patchbay/core';
import { ServerResponse } from 'http';
import { sendJson } from '../utils';

export function getDecisions(store: Store, response: ServerResponse) {
    sendJson(response, 200, store.listDecisions());
}
