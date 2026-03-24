import { createServer as createHttpServer, IncomingMessage, Server, ServerResponse } from 'http';
import * as path from 'path';
import { Store } from '@patchbay/core';
import type { CreateServerOptions } from './types';
import { getState } from './handlers/state';
import { getTasks, getTask, postTask, patchTask } from './handlers/tasks';
import { getRuns, postRun } from './handlers/runs';
import { getSessions, getSession, getSessionEvents } from './handlers/sessions';
import { getDecisions, postDecision } from './handlers/decisions';
import { getAgents } from './handlers/agents';
import { getArtifacts } from './handlers/artifacts';
import { postDispatch } from './handlers/dispatch';
import { postReply } from './handlers/reply';
import { getEvents } from './handlers/events';
import { postConnect } from './handlers/connect';
import { getAgentEvents } from './handlers/agent-events';
import { postAgentInput, postAgentApprove, postAgentDeny, postAgentCancel } from './handlers/agent-input';
import { getConnectors } from './handlers/connectors';
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

            if (urlPath === '/tasks') {
                if (method === 'GET') { getTasks(store, response); return; }
                if (method === 'POST') { await postTask(store, request, response); return; }
            }

            const taskMatch = urlPath.match(/^\/tasks\/([^/]+)$/);
            if (taskMatch) {
                if (method === 'GET') { getTask(store, response, taskMatch[1]); return; }
                if (method === 'PATCH') { await patchTask(store, request, response, taskMatch[1]); return; }
            }

            if (urlPath === '/runs') {
                if (method === 'GET') { const { taskId } = parseQueryString(rawUrl); getRuns(store, response, taskId); return; }
                if (method === 'POST') { await postRun(store, request, response); return; }
            }

            if (urlPath === '/sessions' && method === 'GET') {
                const { taskId } = parseQueryString(rawUrl);
                getSessions(store, response, taskId);
                return;
            }

            const sessionMatch = urlPath.match(/^\/sessions\/([^/]+)$/);
            if (sessionMatch && method === 'GET') {
                getSession(store, response, sessionMatch[1]);
                return;
            }

            const sessionEventsMatch = urlPath.match(/^\/sessions\/([^/]+)\/events$/);
            if (sessionEventsMatch && method === 'GET') {
                getSessionEvents(store, response, sessionEventsMatch[1]);
                return;
            }

            if (urlPath === '/decisions') {
                if (method === 'GET') { getDecisions(store, response); return; }
                if (method === 'POST') { await postDecision(store, request, response); return; }
            }

            if (method === 'GET' && urlPath === '/agents') {
                await getAgents(agentsDir, response);
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

            if (method === 'POST' && urlPath === '/reply') {
                await postReply(orchestrator, request, response);
                return;
            }

            if (method === 'GET' && urlPath === '/events') {
                getEvents(agentsDir, request, response);
                return;
            }

            // --- Connector / Agent Session endpoints ---

            if (method === 'POST' && urlPath === '/connect') {
                await postConnect(orchestrator, request, response);
                return;
            }

            if (method === 'GET' && urlPath === '/connectors') {
                await getConnectors(orchestrator, response);
                return;
            }

            const agentEventsMatch = urlPath.match(/^\/agent-events\/([^/]+)$/);
            if (method === 'GET' && agentEventsMatch) {
                getAgentEvents(orchestrator, agentEventsMatch[1], request, response);
                return;
            }

            const agentInputMatch = urlPath.match(/^\/agent-input\/([^/]+)$/);
            if (method === 'POST' && agentInputMatch) {
                await postAgentInput(orchestrator, agentInputMatch[1], request, response);
                return;
            }

            const agentApproveMatch = urlPath.match(/^\/agent-approve\/([^/]+)$/);
            if (method === 'POST' && agentApproveMatch) {
                await postAgentApprove(orchestrator, agentApproveMatch[1], request, response);
                return;
            }

            const agentDenyMatch = urlPath.match(/^\/agent-deny\/([^/]+)$/);
            if (method === 'POST' && agentDenyMatch) {
                await postAgentDeny(orchestrator, agentDenyMatch[1], request, response);
                return;
            }

            const agentCancelMatch = urlPath.match(/^\/agent-cancel\/([^/]+)$/);
            if (method === 'POST' && agentCancelMatch) {
                await postAgentCancel(orchestrator, agentCancelMatch[1], request, response);
                return;
            }

            sendJson(response, 404, { error: 'Not found' });
        }
    );

    return server;
}
