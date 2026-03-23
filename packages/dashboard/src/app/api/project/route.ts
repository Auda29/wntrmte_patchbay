import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';

export async function PATCH(request: Request) {
    try {
        const store = getStore();
        if (!store.isInitialized) {
            return NextResponse.json({ error: 'Patchbay not initialized' }, { status: 404 });
        }

        const { goal, rules, techStack } = await request.json();
        const project = store.getProject();

        project.goal = typeof goal === 'string' ? goal : project.goal;
        project.rules = Array.isArray(rules) ? rules.map(String) : project.rules;
        project.techStack = Array.isArray(techStack) ? techStack.map(String) : project.techStack;

        store.saveProject(project);
        return NextResponse.json(project);
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Internal error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
