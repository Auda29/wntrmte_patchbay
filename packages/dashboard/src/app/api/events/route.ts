import * as path from 'path';
import { getEventBus } from '@/lib/eventBus';

const REPO_ROOT = process.env.PATCHBAY_REPO_ROOT || path.resolve(process.cwd(), '../..');
const AGENTS_DIR = path.join(REPO_ROOT, '.project-agents');

export async function GET(request: Request) {
    const bus = getEventBus(AGENTS_DIR);

    const stream = new ReadableStream({
        start(controller) {
            // Send initial keepalive
            controller.enqueue(new TextEncoder().encode(': connected\n\n'));

            const onChange = () => {
                try {
                    controller.enqueue(
                        new TextEncoder().encode(`data: ${JSON.stringify({ type: 'change' })}\n\n`)
                    );
                } catch {
                    // Client disconnected
                    bus.removeListener('change', onChange);
                }
            };

            bus.on('change', onChange);

            // Cleanup when client disconnects
            request.signal.addEventListener('abort', () => {
                bus.removeListener('change', onChange);
            });
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        },
    });
}
