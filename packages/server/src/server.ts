import { createServer as createHttpServer, IncomingMessage, Server, ServerResponse } from 'http';
import * as path from 'path';
import { Store } from '@patchbay/core';
import type { CreateServerOptions } from './types';
import { getState } from './handlers/state';
import { getTasks, getTask } from './handlers/tasks';
import { getRuns } from './handlers/runs';
import { getDecisions } from './handlers/decisions';
import { getAgents } from './handlers/agents';
import { getArtifacts } from './handlers/artifacts';
import { postDispatch } from './handlers/dispatch';
import { getEvents } from './handlers/events';
import { createConfiguredOrchestrator } from './runtime';
import { sendJson, parseQueryString } from './utils';

export async function createServer(opts: CreateServerOptions): Promise<Server> {
    const store = new Store(opts.repoRoot);
    const orchestrator = createConfiguredOrchestrator(opts.repoRoot);
    const agentsDir = path.join(opts.repoRoot, '.project-agents');

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

            const rawUrl = request.url || '/';
            const urlPath = rawUrl.split('?')[0];
            const method = request.method ?? 'GET';

            if (method === 'GET' && urlPath === '/health') {
                sendJson(response, 200, { ok: true });
                return;
            }

            if (!store.isInitialized) {
                sendJson(response, 404, { error: 'Patchbay not initialized' });
                return;
            }

            if (method === 'GET' && urlPath === '/state') {
                sendJson(response, 200, getState(store));
                return;
            }

            if (method === 'GET' && urlPath === '/tasks') {
                getTasks(store, response);
                return;
            }

            const taskMatch = urlPath.match(/^\/tasks\/([^/]+)$/);
            if (method === 'GET' && taskMatch) {
                getTask(store, response, taskMatch[1]);
                return;
            }

            if (method === 'GET' && urlPath === '/runs') {
                const { taskId } = parseQueryString(rawUrl);
                getRuns(store, response, taskId);
                return;
            }

            if (method === 'GET' && urlPath === '/decisions') {
                getDecisions(store, response);
                return;
            }

            if (method === 'GET' && urlPath === '/agents') {
                getAgents(agentsDir, response);
                return;
            }

            if (method === 'GET' && urlPath === '/artifacts') {
                getArtifacts(store, agentsDir, response);
                return;
            }

            if (method === 'POST' && urlPath === '/dispatch') {
                await postDispatch(orchestrator, request, response);
                return;
            }

            if (method === 'GET' && urlPath === '/events') {
                getEvents(agentsDir, request, response);
                return;
            }

            sendJson(response, 404, { error: 'Not found' });
        }
    );

    return server;
}
