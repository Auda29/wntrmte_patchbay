import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { getOrchestrator } from '@/lib/runtime';

export async function POST(request: Request) {
    try {
        const store = getStore();
        if (!store.isInitialized) {
            return NextResponse.json({ error: 'Patchbay is not initialized.' }, { status: 404 });
        }

        const { sessionId, action, text, permissionId } = await request.json();
        if (!sessionId || !action) {
            return NextResponse.json({ error: 'Missing sessionId or action' }, { status: 400 });
        }

        const orchestrator = getOrchestrator();

        switch (action) {
            case 'input':
                if (typeof text !== 'string') {
                    return NextResponse.json({ error: 'Missing text for input action' }, { status: 400 });
                }
                await orchestrator.sendInput(sessionId, text);
                break;

            case 'approve':
                if (typeof permissionId !== 'string') {
                    return NextResponse.json({ error: 'Missing permissionId for approve action' }, { status: 400 });
                }
                await orchestrator.approveSession(sessionId, permissionId);
                break;

            case 'deny':
                if (typeof permissionId !== 'string') {
                    return NextResponse.json({ error: 'Missing permissionId for deny action' }, { status: 400 });
                }
                await orchestrator.denySession(sessionId, permissionId);
                break;

            case 'cancel':
                await orchestrator.cancelSession(sessionId);
                break;

            default:
                return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        const err = error instanceof Error ? error : new Error('Internal error');
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
