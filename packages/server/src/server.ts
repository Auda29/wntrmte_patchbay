import { createServer as createHttpServer, IncomingMessage, Server, ServerResponse } from 'http';
import { Store } from '@patchbay/core';
import type { CreateServerOptions } from './types';
import { getState } from './handlers/state';
import { createConfiguredOrchestrator } from './runtime';

export async function createServer(opts: CreateServerOptions) {
    const store = new Store(opts.repoRoot);
    const orchestrator = createConfiguredOrchestrator(opts.repoRoot);

    const server = createHttpServer(
        async (request: IncomingMessage, response: ServerResponse) => {
            response.setHeader('Access-Control-Allow-Origin', '*');
            response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
            response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            if (request.method === 'OPTIONS') {
                response.statusCode = 204;
                response.end();
                return;
            }

            const url = request.url || '/';

            if (request.method === 'GET' && url === '/health') {
                sendJson(response, 200, { ok: true });
                return;
            }

            if (request.method === 'GET' && url === '/state') {
                if (!store.isInitialized) {
                    sendJson(response, 404, { error: 'Patchbay not initialized' });
                    return;
                }

                sendJson(response, 200, getState(store));
                return;
            }

            void orchestrator;
            sendJson(response, 404, { error: 'Not found' });
        }
    );

    return server;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
    response.statusCode = statusCode;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(payload));
}
