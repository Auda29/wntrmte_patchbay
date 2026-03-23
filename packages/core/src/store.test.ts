import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { Store } from './store';

describe('Store', () => {
    let tmpDir: string;
    let store: Store;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patchbay-store-test-'));
        store = new Store(tmpDir);
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // ------------------------------------------------------------------ init

    describe('init', () => {
        it('creates all required subdirectories', () => {
            store.init({ name: 'Test', goal: 'Test goal' });
            const base = path.join(tmpDir, '.project-agents');
            expect(fs.existsSync(path.join(base, 'tasks'))).toBe(true);
            expect(fs.existsSync(path.join(base, 'runs'))).toBe(true);
            expect(fs.existsSync(path.join(base, 'decisions'))).toBe(true);
            expect(fs.existsSync(path.join(base, 'agents'))).toBe(true);
            expect(fs.existsSync(path.join(base, 'context'))).toBe(true);
        });

        it('marks store as initialized', () => {
            expect(store.isInitialized).toBe(false);
            store.init({ name: 'Test', goal: 'Test goal' });
            expect(store.isInitialized).toBe(true);
        });

        it('throws if called twice', () => {
            store.init({ name: 'Test', goal: 'Test goal' });
            expect(() => store.init({ name: 'Test', goal: 'Test goal' })).toThrow();
        });
    });

    // ----------------------------------------------------------------- tasks

    describe('tasks', () => {
        beforeEach(() => {
            store.init({ name: 'Test', goal: 'Test goal' });
        });

        it('createTask returns a task with status open and a readable TASK- id', () => {
            const task = store.createTask('Write tests', 'Cover core logic');
            expect(task.status).toBe('open');
            expect(task.title).toBe('Write tests');
            expect(task.id).toMatch(/^TASK-write-tests-[a-f0-9]{8}$/);
        });

        it('listTasks returns all created tasks', () => {
            const a = store.createTask('Task A', 'Goal A');
            const b = store.createTask('Task B', 'Goal B');
            const ids = store.listTasks().map(t => t.id);
            expect(ids).toContain(a.id);
            expect(ids).toContain(b.id);
        });

        it('listTasks returns empty array when no tasks exist', () => {
            expect(store.listTasks()).toHaveLength(0);
        });

        it('getTask returns task by id', () => {
            const created = store.createTask('My Task', 'Goal');
            const fetched = store.getTask(created.id);
            expect(fetched).not.toBeNull();
            expect(fetched!.id).toBe(created.id);
        });

        it('getTask returns null for unknown id', () => {
            expect(store.getTask('TASK-UNKNOWN')).toBeNull();
        });

        it('saveTask persists a status change immutably', () => {
            const task = store.createTask('My Task', 'Goal');
            const updated = { ...task, status: 'in_progress' as const };
            store.saveTask(updated);
            expect(store.getTask(task.id)?.status).toBe('in_progress');
        });
    });

    // ------------------------------------------------------------------ runs

    describe('runs', () => {
        beforeEach(() => {
            store.init({ name: 'Test', goal: 'Test goal' });
        });

        it('saveRun and listRuns round-trip', () => {
            const run = {
                id: 'run-001',
                taskId: 'TASK-001',
                runner: 'bash',
                startTime: new Date().toISOString(),
                status: 'completed' as const,
            };
            store.saveRun(run);
            const runs = store.listRuns();
            expect(runs).toHaveLength(1);
            expect(runs[0].id).toBe('run-001');
        });

        it('listRuns filters by taskId', () => {
            const base = { runner: 'bash', startTime: new Date().toISOString(), status: 'completed' as const };
            store.saveRun({ ...base, id: 'run-a', taskId: 'TASK-001' });
            store.saveRun({ ...base, id: 'run-b', taskId: 'TASK-002' });
            const filtered = store.listRuns('TASK-001');
            expect(filtered).toHaveLength(1);
            expect(filtered[0].id).toBe('run-a');
        });

        it('listRuns returns empty array when no runs exist', () => {
            expect(store.listRuns()).toHaveLength(0);
        });
    });

    // --------------------------------------------------------------- decisions

    describe('decisions', () => {
        beforeEach(() => {
            store.init({ name: 'Test', goal: 'Test goal' });
        });

        it('createDecision and listDecisions round-trip', () => {
            store.createDecision('Use TypeScript', 'Better DX and safety', 'Alice');
            const decisions = store.listDecisions();
            expect(decisions).toHaveLength(1);
            expect(decisions[0].title).toBe('Use TypeScript');
            expect(decisions[0].proposedBy).toBe('Alice');
        });

        it('createDecision generates a DEC- id', () => {
            const dec = store.createDecision('Use Vitest', 'Fast and ESM-native');
            expect(dec.id).toMatch(/^DEC-/);
        });
    });
});
