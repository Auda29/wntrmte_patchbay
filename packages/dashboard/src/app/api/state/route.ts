import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';

export async function GET() {
    try {
        const store = getStore();
        if (!store.isInitialized) {
            return NextResponse.json({ error: 'Patchbay not initialized' }, { status: 404 });
        }

        const state = {
            project: store.getProject(),
            tasks: store.listTasks(),
            runs: store.listRuns(),
            decisions: store.listDecisions()
        };

        return NextResponse.json(state);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
