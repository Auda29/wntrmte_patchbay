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

        const runs = store.listRuns(taskId);
        return NextResponse.json(runs);
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Internal error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const store = getStore();
        if (!store.isInitialized) {
            return NextResponse.json({ error: 'Patchbay not initialized' }, { status: 404 });
        }

        const run = await request.json();
        if (!run.taskId || !run.runner || !run.status || !run.startTime) {
            return NextResponse.json(
                { error: 'Missing required fields: taskId, runner, status, startTime' },
                { status: 400 }
            );
        }

        store.saveRun(run);
        return NextResponse.json(run, { status: 201 });
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Internal error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
