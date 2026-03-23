import { Orchestrator, AgentEvent } from '@patchbay/core';
import { IncomingMessage, ServerResponse } from 'http';
import { sendJson } from '../utils';

export function getAgentEvents(
    orchestrator: Orchestrator,
    sessionId: string,
    request: IncomingMessage,
    response: ServerResponse
) {
    const session = orchestrator.getSession(sessionId);
    if (!session) {
        sendJson(response, 404, { error: `No active session ${sessionId}` });
        return;
    }

    // SSE headers
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();

    response.write(': connected\n\n');

    const onEvent = (event: AgentEvent) => {
        try {
            response.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch {
            cleanup();
        }
    };

    const onClose = () => {
        try {
            response.write(`data: ${JSON.stringify({ type: 'stream:end' })}\n\n`);
        } catch {
            // response already closed
        }
        cleanup();
    };

    const cleanup = () => {
        session.off('event', onEvent);
        session.off('close', onClose);
        response.end();
    };

    session.on('event', onEvent);
    session.on('close', onClose);
    request.on('close', cleanup);
}
