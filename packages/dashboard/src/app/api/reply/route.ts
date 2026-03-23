import { NextResponse } from 'next/server';
import { getStore, REPO_ROOT } from '@/lib/store';
import { createConfiguredOrchestrator } from '@patchbay/server';

export async function POST(request: Request) {
    try {
        const store = getStore();
        if (!store.isInitialized) {
            return NextResponse.json({ error: 'Patchbay is not initialized.' }, { status: 404 });
        }

        const { conversationId, message, runnerId } = await request.json();
        if (!conversationId || !message) {
            return NextResponse.json({ error: 'Missing conversationId or message' }, { status: 400 });
        }

        const orchestrator = createConfiguredOrchestrator(REPO_ROOT);
        const run = await orchestrator.continueConversation(conversationId, message, runnerId);
        return NextResponse.json(run, { status: 200 });
    } catch (error) {
        const err = error instanceof Error ? error : new Error('Internal error');
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
