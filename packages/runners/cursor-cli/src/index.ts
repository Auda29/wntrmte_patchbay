import { Runner, RunnerInput, RunnerOutput } from '@patchbay/core';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

function buildPrompt(input: RunnerInput): string {
    const parts: string[] = [];

    if (input.projectRules) {
        parts.push(`## Project Rules\n${input.projectRules}`);
    }

    if (input.contextFiles?.length) {
        const contextParts = input.contextFiles
            .filter(f => fs.existsSync(f))
            .map(f => `### ${path.basename(f)}\n${fs.readFileSync(f, 'utf-8')}`);
        if (contextParts.length) {
            parts.push(`## Context\n${contextParts.join('\n\n')}`);
        }
    }

    if (input.affectedFiles?.length) {
        parts.push(`## Affected Files\n${input.affectedFiles.map(f => `- ${f}`).join('\n')}`);
    }

    parts.push(`## Task\n${input.goal}`);

    return parts.join('\n\n');
}

export class CursorCliRunner implements Runner {
    name = 'cursor-cli';

    async execute(input: RunnerInput): Promise<RunnerOutput> {
        const logs: string[] = [];

        // Check if cursor CLI is available
        try {
            await execAsync('cursor --version');
        } catch {
            return {
                status: 'failed',
                summary: 'cursor CLI not found. Install Cursor and ensure it is in PATH.',
                logs: ['ERROR: `cursor` command not found in PATH.'],
            };
        }

        const prompt = buildPrompt(input);
        logs.push(`Prompt built (${prompt.length} chars)`);

        try {
            const { stdout, stderr } = await execAsync(
                `cursor agent -p ${JSON.stringify(prompt)} --output-format text`,
                { cwd: input.repoPath, maxBuffer: 10 * 1024 * 1024 }
            );

            if (stderr) logs.push(`STDERR:\n${stderr}`);
            if (stdout) logs.push(`OUTPUT:\n${stdout}`);

            return {
                status: 'completed',
                summary: stdout.split('\n').find(l => l.trim()) ?? 'Cursor CLI run completed.',
                logs,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logs.push(`ERROR:\n${message}`);
            return {
                status: 'failed',
                summary: `Cursor CLI run failed: ${message}`,
                logs,
            };
        }
    }
}
