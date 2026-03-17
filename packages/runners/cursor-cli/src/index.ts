import { Runner, RunnerInput, RunnerOutput, RunnerAuth } from '@patchbay/core';

export class CursorCliRunner implements Runner {
    name = 'cursor-cli';

    constructor(private readonly _auth?: RunnerAuth) {}

    async execute(_input: RunnerInput): Promise<RunnerOutput> {
        return {
            status: 'failed',
            summary: 'cursor agent -p is not headless: it opens Cursor interactively and cannot be used as a background runner.',
            logs: [
                'ERROR: `cursor agent -p` opens the Cursor UI interactively — this is not a non-interactive CLI mode.',
                'HINT: Use the "cursor" runner (file-based handoff) or the "claude-code" runner for headless AI coding.',
            ],
        };
    }
}
