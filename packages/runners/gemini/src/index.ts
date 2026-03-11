import { Runner, RunnerInput, RunnerOutput, RunnerAuth } from '@patchbay/core';
import { exec } from 'child_process';
import { promisify } from 'util';
import { buildPrompt } from '@patchbay/runner-claude-code';

const execAsync = promisify(exec);

export class GeminiRunner implements Runner {
    name = 'gemini';

    constructor(private readonly auth?: RunnerAuth) {}

    async execute(input: RunnerInput): Promise<RunnerOutput> {
        const logs: string[] = [];

        // Check if gemini CLI is available
        try {
            await execAsync('gemini --version');
        } catch {
            return {
                status: 'failed',
                summary: 'gemini CLI not found. Install Google Gemini CLI to use this runner.',
                logs: ['ERROR: `gemini` command not found in PATH.'],
            };
        }

        const prompt = buildPrompt(input);
        logs.push(`Prompt built (${prompt.length} chars)`);

        const env = this.auth?.mode === 'apiKey'
            ? { ...process.env, GEMINI_API_KEY: this.auth.apiKey }
            : process.env;

        try {
            const { stdout, stderr } = await execAsync(
                `gemini -p ${JSON.stringify(prompt)}`,
                { cwd: input.repoPath, maxBuffer: 10 * 1024 * 1024, env }
            );

            if (stderr) logs.push(`STDERR:\n${stderr}`);
            if (stdout) logs.push(`OUTPUT:\n${stdout}`);

            return {
                status: 'completed',
                summary: stdout.split('\n').find(l => l.trim()) ?? 'Gemini run completed.',
                logs,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logs.push(`ERROR:\n${message}`);
            return {
                status: 'failed',
                summary: `Gemini run failed: ${message}`,
                logs,
            };
        }
    }
}
