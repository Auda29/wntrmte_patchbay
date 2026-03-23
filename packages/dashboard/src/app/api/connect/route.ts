import { NextResponse } from 'next/server';
import { getStore, REPO_ROOT } from '@/lib/store';
import { getOrchestrator } from '@/lib/runtime';
import * as path from 'path';

export async function POST(request: Request) {
    try {
        const store = getStore();
        if (!store.isInitialized) {
            return NextResponse.json({
                error: 'Patchbay is not initialized for the dashboard target repository.',
                hint: 'Start the dashboard with PATCHBAY_REPO_ROOT pointing at your project, or initialize Patchbay in that repository first.',
                details: {
                    repoRoot: REPO_ROOT,
                    expectedProjectFile: path.join(REPO_ROOT, '.project-agents', 'project.yml'),
                }
            }, { status: 404 });
        }

        const { taskId, connectorId } = await request.json();
        if (!taskId || !connectorId) {
            return NextResponse.json({ error: 'Missing taskId or connectorId' }, { status: 400 });
        }

        const orchestrator = getOrchestrator();
        const session = await orchestrator.connectAgent(taskId, connectorId);
        return NextResponse.json(
            { sessionId: session.sessionId, connectorId: session.connectorId },
            { status: 202 }
        );
    } catch (error) {
        const err = error instanceof Error ? error : new Error('Internal error');
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
