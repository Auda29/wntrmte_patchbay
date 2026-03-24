import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { getOrchestrator } from '@/lib/runtime';

const installHints: Record<string, string> = {
  'claude-code': 'npm install -g @anthropic-ai/claude-code',
  codex: 'npm install -g @openai/codex',
  gemini: 'npm install -g @google/gemini-cli',
  'cursor-cli': 'https://cursor.com/download',
};

export async function GET() {
    try {
        const store = getStore();
        if (!store.isInitialized) {
            return NextResponse.json({ error: 'Patchbay is not initialized.' }, { status: 404 });
        }

        const orchestrator = getOrchestrator();
        const connectors = orchestrator.listConnectors();

        const result = await Promise.all(
            connectors.map(async (c) => {
                let available = false;
                try {
                    available = await c.isAvailable();
                } catch {
                    // treat check failure as unavailable
                }
                return {
                    id: c.id,
                    name: c.name,
                    capabilities: c.capabilities,
                    available,
                    installHint: available ? undefined : installHints[c.id],
                };
            })
        );

        return NextResponse.json(result);
    } catch (error) {
        const err = error instanceof Error ? error : new Error('Internal error');
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
