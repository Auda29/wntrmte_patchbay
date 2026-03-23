import { Orchestrator } from '@patchbay/core';
import { IncomingMessage, ServerResponse } from 'http';
import { sendJson, readBody } from '../utils';

export async function postAgentInput(
    orchestrator: Orchestrator,
    sessionId: string,
    request: IncomingMessage,
    response: ServerResponse
) {
    let body: unknown;
    try {
        body = await readBody(request);
    } catch {
        sendJson(response, 400, { error: 'Invalid JSON body' });
        return;
    }

    const { text } = body as Record<string, unknown>;
    if (typeof text !== 'string') {
        sendJson(response, 400, { error: 'Missing or invalid text' });
        return;
    }

    try {
        await orchestrator.sendInput(sessionId, text);
        sendJson(response, 200, { ok: true });
    } catch (error) {
        const err = error instanceof Error ? error : new Error('Internal error');
        sendJson(response, 500, { error: err.message });
    }
}

export async function postAgentApprove(
    orchestrator: Orchestrator,
    sessionId: string,
    request: IncomingMessage,
    response: ServerResponse
) {
    let body: unknown;
    try {
        body = await readBody(request);
    } catch {
        sendJson(response, 400, { error: 'Invalid JSON body' });
        return;
    }

    const { permissionId } = body as Record<string, unknown>;
    if (typeof permissionId !== 'string') {
        sendJson(response, 400, { error: 'Missing or invalid permissionId' });
        return;
    }

    try {
        await orchestrator.approveSession(sessionId, permissionId);
        sendJson(response, 200, { ok: true });
    } catch (error) {
        const err = error instanceof Error ? error : new Error('Internal error');
        sendJson(response, 500, { error: err.message });
    }
}

export async function postAgentDeny(
    orchestrator: Orchestrator,
    sessionId: string,
    request: IncomingMessage,
    response: ServerResponse
) {
    let body: unknown;
    try {
        body = await readBody(request);
    } catch {
        sendJson(response, 400, { error: 'Invalid JSON body' });
        return;
    }

    const { permissionId } = body as Record<string, unknown>;
    if (typeof permissionId !== 'string') {
        sendJson(response, 400, { error: 'Missing or invalid permissionId' });
        return;
    }

    try {
        await orchestrator.denySession(sessionId, permissionId);
        sendJson(response, 200, { ok: true });
    } catch (error) {
        const err = error instanceof Error ? error : new Error('Internal error');
        sendJson(response, 500, { error: err.message });
    }
}

export async function postAgentCancel(
    orchestrator: Orchestrator,
    sessionId: string,
    _request: IncomingMessage,
    response: ServerResponse
) {
    try {
        await orchestrator.cancelSession(sessionId);
        sendJson(response, 200, { ok: true });
    } catch (error) {
        const err = error instanceof Error ? error : new Error('Internal error');
        sendJson(response, 500, { error: err.message });
    }
}
