import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const store = getStore();
    if (!store.isInitialized) {
      return NextResponse.json({ error: 'Patchbay not initialized' }, { status: 404 });
    }

    if (!store.getSession(sessionId)) {
      return NextResponse.json({ error: `Session ${sessionId} not found` }, { status: 404 });
    }

    return NextResponse.json(store.listSessionEvents(sessionId));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
