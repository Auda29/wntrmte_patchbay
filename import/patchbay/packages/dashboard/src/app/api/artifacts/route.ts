import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import * as path from 'path';
import * as fs from 'fs';

export async function GET() {
    try {
        const store = getStore();
        if (!store.isInitialized) {
            return NextResponse.json({ error: 'Patchbay not initialized' }, { status: 404 });
        }

        // We can expose context files as artifacts
        // Due to private properties in store, we read the context dir directly for this demo, 
        // or we could use the Project repoPath.
        const project = store.getProject();
        const baseDir = path.join(project.repoPath || process.cwd(), '.project-agents', 'context');

        let contextFiles: { name: string, content: string }[] = [];
        if (fs.existsSync(baseDir)) {
            contextFiles = fs.readdirSync(baseDir)
                .filter(f => fs.statSync(path.join(baseDir, f)).isFile())
                .map(f => ({
                    name: f,
                    content: fs.readFileSync(path.join(baseDir, f), 'utf-8')
                }));
        }

        // We can also harvest diffRefs from completed runs
        const runs = store.listRuns().filter(r => r.diffRef);

        return NextResponse.json({
            contextFiles,
            runsWithDiffs: runs.map(r => ({
                runId: r.id,
                taskId: r.taskId,
                diffRef: r.diffRef
            }))
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Internal error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
