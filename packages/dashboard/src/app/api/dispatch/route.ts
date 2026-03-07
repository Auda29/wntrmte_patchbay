import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { Orchestrator } from '@patchbay/core';
import { BashRunner } from '@patchbay/runner-bash';
import { HttpRunner } from '@patchbay/runner-http';
import { CursorRunner } from '@patchbay/runner-cursor';

const orchestrator = new Orchestrator();
orchestrator.registerRunner('bash', new BashRunner());
orchestrator.registerRunner('http', new HttpRunner());
orchestrator.registerRunner('cursor', new CursorRunner());

export async function POST(request: Request) {
    try {
        const store = getStore();
        if (!store.isInitialized) {
            return NextResponse.json({ error: 'Patchbay not initialized' }, { status: 404 });
        }

        const { taskId, runnerId } = await request.json();
        if (!taskId || !runnerId) {
            return NextResponse.json({ error: 'Missing taskId or runnerId' }, { status: 400 });
        }

        // In a real production app, this would be an asynchronous job queue.
        // We await it here directly for simplicity, but long-running tasks will block the HTTP response.
        const run = await orchestrator.dispatchTask(taskId, runnerId);
        return NextResponse.json(run);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
