import * as fs from 'fs';
import * as path from 'path';
import { Store } from '@patchbay/core';
import { ServerResponse } from 'http';
import { sendJson } from '../utils';

export function getArtifacts(store: Store, agentsDir: string, response: ServerResponse) {
    const contextDir = path.join(agentsDir, 'context');

    let contextFiles: { name: string; content: string }[] = [];
    if (fs.existsSync(contextDir)) {
        contextFiles = fs.readdirSync(contextDir)
            .filter(f => fs.statSync(path.join(contextDir, f)).isFile())
            .map(f => ({
                name: f,
                content: fs.readFileSync(path.join(contextDir, f), 'utf-8'),
            }));
    }

    const runsWithDiffs = store.listRuns()
        .filter(r => r.diffRef)
        .map(r => ({ runId: r.id, taskId: r.taskId, diffRef: r.diffRef }));

    sendJson(response, 200, { contextFiles, runsWithDiffs });
}
