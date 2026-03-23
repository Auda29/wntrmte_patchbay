import { Store } from '@patchbay/core';
import { StateResponse } from '../types';

export function getState(store: Store): StateResponse {
    return {
        project: store.getProject(),
        tasks: store.listTasks(),
        runs: store.listRuns(),
        decisions: store.listDecisions()
    };
}
