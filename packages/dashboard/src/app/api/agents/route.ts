import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'yaml';

export async function GET() {
    try {
        const store = getStore();
        if (!store.isInitialized) {
            return NextResponse.json({ error: 'Patchbay not initialized' }, { status: 404 });
        }

        const project = store.getProject();
        const agentsDir = path.join(project.repoPath || process.cwd(), '.project-agents', 'agents');

        let agents: { id: string; role: string; toolType: string }[] = [];
        if (fs.existsSync(agentsDir)) {
            agents = fs.readdirSync(agentsDir)
                .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
                .map(f => {
                    const content = fs.readFileSync(path.join(agentsDir, f), 'utf-8');
                    const data = yaml.parse(content);
                    return {
                        id: path.basename(f, path.extname(f)),
                        role: data.role || f,
                        toolType: data.toolType || 'bash'
                    };
                });
        }

        // Always include built-in runner types even if no agent profiles exist
        const builtInRunners = [
            { id: 'bash', role: 'Shell Command Runner', toolType: 'bash' },
            { id: 'http', role: 'HTTP Request Runner', toolType: 'http' },
            { id: 'cursor', role: 'Cursor (file-based)', toolType: 'cursor' },
            { id: 'cursor-cli', role: 'Cursor CLI (agent -p)', toolType: 'cursor-cli' },
            { id: 'claude-code', role: 'Claude Code (CLI)', toolType: 'claude-code' },
            { id: 'codex', role: 'OpenAI Codex (CLI)', toolType: 'codex' },
            { id: 'gemini', role: 'Google Gemini (CLI)', toolType: 'gemini' },
        ];

        // Merge: use agent profiles if present, otherwise fall back to built-in
        const existingIds = new Set(agents.map(a => a.id));
        for (const runner of builtInRunners) {
            if (!existingIds.has(runner.id)) agents.push(runner);
        }

        return NextResponse.json({ agents });
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Internal error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
