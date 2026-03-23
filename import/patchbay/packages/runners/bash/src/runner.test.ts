import { describe, it, expect } from 'vitest';
import { BashRunner } from './index';

const baseInput = {
    taskId: 'TASK-001',
    repoPath: process.cwd(),
    branch: 'main',
    goal: '',
};

describe('BashRunner', () => {
    it('executes a command and returns completed status', async () => {
        const runner = new BashRunner();
        const output = await runner.execute({ ...baseInput, goal: 'echo hello' });
        expect(output.status).toBe('completed');
        expect(output.logs.join('\n')).toContain('hello');
    });

    it('captures stdout in logs', async () => {
        const runner = new BashRunner();
        const output = await runner.execute({ ...baseInput, goal: 'echo patchbay' });
        expect(output.logs.join('\n')).toContain('patchbay');
    });

    it('returns failed status for a command that exits non-zero', async () => {
        const runner = new BashRunner();
        const output = await runner.execute({ ...baseInput, goal: 'exit 1' });
        expect(output.status).toBe('failed');
    });

    it('includes error message in logs on failure', async () => {
        const runner = new BashRunner();
        const output = await runner.execute({ ...baseInput, goal: 'false' });
        expect(output.status).toBe('failed');
        expect(output.logs.length).toBeGreaterThan(0);
    });

    it('has name "bash"', () => {
        expect(new BashRunner().name).toBe('bash');
    });
});
