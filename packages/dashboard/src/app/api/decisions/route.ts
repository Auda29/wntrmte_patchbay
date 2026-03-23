import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';

export async function POST(request: Request) {
    try {
        const store = getStore();
        if (!store.isInitialized) {
            return NextResponse.json({ error: 'Patchbay not initialized' }, { status: 404 });
        }

        const { title, rationale, proposedBy } = await request.json();
        if (!title || !rationale) {
            return NextResponse.json({ error: 'Missing title or rationale' }, { status: 400 });
        }

        const decision = store.createDecision(title, rationale, proposedBy);
        return NextResponse.json(decision, { status: 201 });
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Internal error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
