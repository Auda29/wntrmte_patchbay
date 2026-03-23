import { getOrchestrator } from '@/lib/runtime';
import type { AgentEvent } from '@patchbay/core';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const orchestrator = getOrchestrator();
  const session = orchestrator.getSession(sessionId);

  if (!session) {
    return Response.json({ error: `No active session ${sessionId}` }, { status: 404 });
  }

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(': connected\n\n'));

      const onEvent = (event: AgentEvent) => {
        try {
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          cleanup();
        }
      };

      const onClose = () => {
        try {
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ type: 'stream:end' })}\n\n`)
          );
        } catch {
          // Stream already closed.
        }
        cleanup();
      };

      const cleanup = () => {
        session.off('event', onEvent);
        session.off('close', onClose);
        controller.close();
      };

      session.on('event', onEvent);
      session.on('close', onClose);
      request.signal.addEventListener('abort', cleanup);
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
