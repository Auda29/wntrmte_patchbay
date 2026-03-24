import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';

export async function GET(request: Request) {
  try {
    const store = getStore();
    if (!store.isInitialized) {
      return NextResponse.json({ error: 'Patchbay not initialized' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId') || undefined;

    return NextResponse.json(store.listSessions(taskId));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
