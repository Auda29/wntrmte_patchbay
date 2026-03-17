import { IncomingMessage, ServerResponse } from 'http';
import { getEventBus } from '../eventBus';

export function getEvents(agentsDir: string, request: IncomingMessage, response: ServerResponse) {
    const bus = getEventBus(agentsDir);

    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();

    // Initial keepalive comment
    response.write(': connected\n\n');

    const onChange = () => {
        try {
            response.write(`data: ${JSON.stringify({ type: 'change' })}\n\n`);
        } catch {
            cleanup();
        }
    };

    const cleanup = () => {
        bus.removeListener('change', onChange);
        response.end();
    };

    bus.on('change', onChange);
    request.on('close', cleanup);
}
