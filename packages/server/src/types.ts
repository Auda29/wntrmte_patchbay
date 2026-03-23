import { IncomingMessage, ServerResponse } from 'http';
import { Store } from '@patchbay/core';

export interface CreateServerOptions {
    repoRoot: string;
    port?: number;
    host?: string;
}

export interface StateResponse {
    project: ReturnType<Store['getProject']>;
    tasks: ReturnType<Store['listTasks']>;
    runs: ReturnType<Store['listRuns']>;
    decisions: ReturnType<Store['listDecisions']>;
}

export interface ServerContext {
    repoRoot: string;
    store: Store;
}

export type RouteHandler<TReply = unknown> = (
    request: IncomingMessage,
    response: ServerResponse,
    context: ServerContext
) => Promise<TReply> | TReply;
