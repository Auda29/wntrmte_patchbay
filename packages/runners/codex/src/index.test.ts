import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';

const spawnMock = vi.fn();

vi.mock('util', () => ({
    promisify: () => async () => ({ stdout: 'codex 0.0.0', stderr: '' }),
}));

vi.mock('child_process', () => ({
    exec: vi.fn(),
    spawn: spawnMock,
}));

class MockChild extends EventEmitter {
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    stdin = {
        write: vi.fn(),
        end: vi.fn(),
    };
    kill = vi.fn();
}

describe('CodexRunner', () => {
    afterEach(() => {
        spawnMock.mockReset();
    });

    it('invokes codex with --skip-git-repo-check', async () => {
        const child = new MockChild();
        spawnMock.mockReturnValue(child);

        const { CodexRunner } = await import('./index');
        const runner = new CodexRunner();

        const promise = runner.execute({
            taskId: 'TASK-1',
            repoPath: '/tmp/repo',
            branch: 'main',
            goal: 'Summarize the repository',
        });

        setTimeout(() => {
            child.stdout.emit('data', Buffer.from('Done\n'));
            child.emit('close', 0);
        }, 0);

        const result = await promise;

        expect(spawnMock).toHaveBeenCalledWith(
            'codex',
            ['exec', '--full-auto', '--skip-git-repo-check'],
            expect.objectContaining({
                cwd: '/tmp/repo',
                stdio: ['pipe', 'pipe', 'pipe'],
            })
        );
        expect(result.status).toBe('completed');
    });
});
