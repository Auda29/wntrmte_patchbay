import { Runner, RunnerInput, RunnerOutput } from '@patchbay/core';
import * as fs from 'fs';
import * as path from 'path';

export class CursorRunner implements Runner {
    name = 'cursor';

    async execute(input: RunnerInput): Promise<RunnerOutput> {
        const logs: string[] = [];
        try {
            const baseDir = path.join(input.repoPath, '.project-agents');
            const contextDir = path.join(baseDir, 'context');

            if (!fs.existsSync(contextDir)) {
                fs.mkdirSync(contextDir, { recursive: true });
            }

            const focusFile = path.join(contextDir, 'current-focus.md');

            const fileContent = [
                `# Current Task Focus: ${input.taskId}`,
                '',
                `**Goal:** ${input.goal}`,
                '',
                `**Affected Files:**`,
                ...(input.affectedFiles || []).map(f => `- ${f}`),
                '',
                `**Context Files:**`,
                ...(input.contextFiles || []).map(f => `- ${f}`),
                '',
                `**Project Rules:**`,
                input.projectRules || 'None'
            ].join('\n');

            fs.writeFileSync(focusFile, fileContent);

            logs.push(`Wrote current task context to ${focusFile}`);
            logs.push(`Ready for manual Cursor execution.`);

            // Since Cursor is file-based and manual in v1, we yield control back to the user
            // by returning 'blocked' (awaiting manual intervention).
            return {
                status: 'blocked',
                summary: `Awaiting manual Cursor execution. View ${focusFile} for context.`,
                logs,
                suggestedNextSteps: ['Open Cursor and ask it to fulfill the goal defined in current-focus.md', 'Update task status once complete.']
            };
        } catch (err: any) {
            logs.push(`ERROR:\n${err.message}`);

            return {
                status: 'failed',
                summary: `Failed to prepare Cursor context: ${err.message}`,
                logs
            };
        }
    }
}
