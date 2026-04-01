import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { Orchestrator } from './orchestrator';
import { Store } from './store';
import type { Runner, RunnerInput, RunnerOutput } from './runner';
import { BaseSession, type AgentConnector, type AgentEvent } from './connector';

const makeCompletedRunner = (): Runner => ({
    name: 'mock',
    execute: async (_input: RunnerInput): Promise<RunnerOutput> => ({
        status: 'completed',
        summary: 'All done',
        logs: ['step 1', 'step 2'],
    }),
});

const makeBlockedRunner = (): Runner => ({
    name: 'blocker',
    execute: async (_input: RunnerInput): Promise<RunnerOutput> => ({
        status: 'blocked',
        summary: 'Need more info',
        logs: [],
        blockers: ['Missing API key'],
    }),
});

const makeFailedRunner = (): Runner => ({
    name: 'failer',
    execute: async (_input: RunnerInput): Promise<RunnerOutput> => ({
        status: 'failed',
        summary: 'Something went wrong',
        logs: ['error: unexpected EOF'],
    }),
});

const makeAwaitingInputRunner = (): Runner => ({
    name: 'asker',
    execute: async (_input: RunnerInput): Promise<RunnerOutput> => ({
        status: 'awaiting_input',
        summary: 'Need permission to edit .gitignore.',
        question: 'May I update `.gitignore` to include `.project-agents/`?',
        logs: ['Need permission to edit .gitignore.'],
        sessionId: 'session-123',
    }),
});

const makeSlowRunner = (output: RunnerOutput, delayMs: number): Runner => ({
    name: 'slow',
    execute: async (_input: RunnerInput): Promise<RunnerOutput> => {
        await new Promise(r => setTimeout(r, delayMs));
        return output;
    },
});

const makeThrowingRunner = (delayMs: number): Runner => ({
    name: 'thrower',
    execute: async (_input: RunnerInput): Promise<RunnerOutput> => {
        await new Promise(r => setTimeout(r, delayMs));
        throw new Error('Runner exploded');
    },
});

class MockInteractiveSession extends BaseSession {
    readonly sessionId: string;
    readonly connectorId: string;
    readonly taskId: string;

    constructor(sessionId: string, connectorId: string, taskId: string) {
        super();
        this.sessionId = sessionId;
        this.connectorId = connectorId;
        this.taskId = taskId;
        this.setStatus('active');
    }

    emitEvent(event: AgentEvent) {
        this.emit(event);
    }

    finish() {
        this.emitClose();
    }

    async sendInput(_text: string): Promise<void> {}
    async approve(_permissionId: string): Promise<void> {}
    async deny(_permissionId: string): Promise<void> {}
    async cancel(): Promise<void> {
        this.setStatus('cancelled');
        this.emitClose();
    }
}

class MockConnector implements AgentConnector {
    readonly id = 'mock-connector';
    readonly name = 'Mock Connector';
    readonly capabilities = {
        streaming: true,
        permissions: true,
        multiTurn: true,
        toolUseReporting: true,
    };

    lastSession: MockInteractiveSession | null = null;
    lastInput: RunnerInput | null = null;

    async connect(input: RunnerInput) {
        this.lastInput = input;
        const session = new MockInteractiveSession(input.sessionId ?? 'fallback-session', this.id, input.taskId);
        this.lastSession = session;
        return session;
    }

    async isAvailable(): Promise<boolean> {
        return true;
    }
}

describe('Orchestrator', () => {
    let tmpDir: string;
    let store: Store;
    let orchestrator: Orchestrator;
    let mockConnector: MockConnector;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patchbay-orch-test-'));
        store = new Store(tmpDir);
        store.init({ name: 'Test Project', goal: 'Test' });
        orchestrator = new Orchestrator(tmpDir);
        orchestrator.registerRunner('mock', makeCompletedRunner());
        orchestrator.registerRunner('blocker', makeBlockedRunner());
        orchestrator.registerRunner('failer', makeFailedRunner());
        orchestrator.registerRunner('asker', makeAwaitingInputRunner());
        mockConnector = new MockConnector();
        orchestrator.registerConnector(mockConnector);
    });

    describe('connectAgent', () => {
        it('creates a persistent session record and run before live events arrive', async () => {
            const task = store.createTask('Interactive task', 'Goal');
            const session = await orchestrator.connectAgent(task.id, 'mock-connector');
            const savedSession = store.getSession(session.sessionId);
            const savedRun = store.listRuns().find((run) => run.sessionId === session.sessionId);

            expect(savedSession?.taskId).toBe(task.id);
            expect(savedSession?.connectorId).toBe('mock-connector');
            expect(savedSession?.status).toBe('running');
            expect(savedRun?.runner).toBe('mock-connector');
        });

        it('persists connector events and updates session status', async () => {
            const task = store.createTask('Needs answer', 'Goal');
            const session = await orchestrator.connectAgent(task.id, 'mock-connector');
            const now = new Date().toISOString();

            mockConnector.lastSession?.emitEvent({
                type: 'agent:question',
                sessionId: session.sessionId,
                question: 'Proceed?',
                timestamp: now,
            });
            mockConnector.lastSession?.emitEvent({
                type: 'session:completed',
                sessionId: session.sessionId,
                summary: 'Done',
                timestamp: now,
            });
            mockConnector.lastSession?.finish();

            const savedSession = store.getSession(session.sessionId);
            const events = store.listSessionEvents(session.sessionId);

            expect(savedSession?.status).toBe('completed');
            expect(savedSession?.summary).toBe('Done');
            expect(events.map((event) => event.type)).toEqual(['agent:question', 'session:completed']);
        });

        it('persists provider session ids from connector events', async () => {
            const task = store.createTask('Provider session task', 'Goal');
            const session = await orchestrator.connectAgent(task.id, 'mock-connector');
            const now = new Date().toISOString();

            mockConnector.lastSession?.emitEvent({
                type: 'session:started',
                sessionId: session.sessionId,
                connectorId: 'mock-connector',
                providerSessionId: 'provider-thread-123',
                timestamp: now,
            });

            const savedSession = store.getSession(session.sessionId);
            expect(savedSession?.providerSessionId).toBe('provider-thread-123');
        });

        it('reuses the existing session id and provider session id when reconnecting an awaiting-input task', async () => {
            const task = store.createTask('Reconnect task', 'Goal');
            const existingSession = {
                id: 'session-existing',
                taskId: task.id,
                connectorId: 'mock-connector',
                status: 'awaiting_input' as const,
                startTime: new Date(Date.now() - 60_000).toISOString(),
                title: task.title,
                conversationId: 'conv-1',
                providerSessionId: 'provider-thread-existing',
                lastEventAt: new Date(Date.now() - 1_000).toISOString(),
                summary: 'Need your confirmation.',
            };
            store.saveSession(existingSession);
            store.saveTask({ ...task, status: 'awaiting_input' });

            const session = await orchestrator.connectAgent(task.id, 'mock-connector');

            expect(session.sessionId).toBe('session-existing');
            expect(mockConnector.lastSession?.sessionId).toBe('session-existing');
            expect(mockConnector.lastInput?.resumeSessionId).toBe('provider-thread-existing');
        });

        it('forks from an explicit source session by using providerSessionId and a new local session id', async () => {
            const task = store.createTask('Fork task', 'Goal');
            const sourceSession = {
                id: 'session-source',
                taskId: task.id,
                connectorId: 'mock-connector',
                status: 'completed' as const,
                startTime: new Date(Date.now() - 120_000).toISOString(),
                endTime: new Date(Date.now() - 60_000).toISOString(),
                title: task.title,
                conversationId: 'conv-source',
                providerSessionId: 'provider-thread-source',
                lastEventAt: new Date(Date.now() - 30_000).toISOString(),
                summary: 'Original completed session.',
            };
            store.saveSession(sourceSession);
            store.saveTask({ ...task, status: 'review' });

            const session = await orchestrator.connectAgent(task.id, 'mock-connector', {
                mode: 'fork',
                sessionId: sourceSession.id,
            });

            expect(session.sessionId).not.toBe(sourceSession.id);
            expect(mockConnector.lastInput?.resumeSessionId).toBeUndefined();
            expect(mockConnector.lastInput?.forkSessionId).toBe('provider-thread-source');
            expect(store.getSession(sourceSession.id)?.status).toBe('completed');
            expect(store.getSession(sourceSession.id)?.providerSessionId).toBe('provider-thread-source');
            expect(store.getSession(session.sessionId)?.id).toBe(session.sessionId);
            expect(store.getTask(task.id)?.status).toBe('in_progress');
        });
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('dispatches a task and returns a run', async () => {
        const task = store.createTask('Do something', 'Achieve the goal');
        const run = await orchestrator.dispatchTask(task.id, 'mock');
        expect(run.taskId).toBe(task.id);
        expect(run.runner).toBe('mock');
        expect(run.status).toBe('completed');
    });

    it('transitions task to review after completed run', async () => {
        const task = store.createTask('Do something', 'Goal');
        await orchestrator.dispatchTask(task.id, 'mock');
        expect(store.getTask(task.id)?.status).toBe('review');
    });

    it('transitions task to blocked when runner returns blocked', async () => {
        const task = store.createTask('Blocked task', 'Goal');
        await orchestrator.dispatchTask(task.id, 'blocker');
        expect(store.getTask(task.id)?.status).toBe('blocked');
    });

    it('run status is completed when runner returns blocked (run finished, task is blocked)', async () => {
        const task = store.createTask('Blocked task', 'Goal');
        const run = await orchestrator.dispatchTask(task.id, 'blocker');
        expect(run.status).toBe('completed');
        expect(run.blockers).toContain('Missing API key');
    });

    it('transitions task back to open when runner fails', async () => {
        const task = store.createTask('Failing task', 'Goal');
        await orchestrator.dispatchTask(task.id, 'failer');
        expect(store.getTask(task.id)?.status).toBe('open');
    });

    it('persists run logs and summary', async () => {
        const task = store.createTask('Task', 'Goal');
        const run = await orchestrator.dispatchTask(task.id, 'mock');
        expect(run.logs).toContain('step 1');
        expect(run.summary).toBe('All done');
    });

    it('marks the run and task as awaiting_input and persists the question', async () => {
        const task = store.createTask('Permission task', 'Goal');
        const run = await orchestrator.dispatchTask(task.id, 'asker');
        expect(run.status).toBe('awaiting_input');
        expect(run.question).toBe('May I update `.gitignore` to include `.project-agents/`?');
        expect(run.sessionId).toBe('session-123');
        expect(store.getTask(task.id)?.status).toBe('awaiting_input');
    });

    it('throws if task does not exist', async () => {
        await expect(orchestrator.dispatchTask('TASK-NOPE', 'mock')).rejects.toThrow('not found');
    });

    it('throws if runner is not registered', async () => {
        const task = store.createTask('Task', 'Goal');
        await expect(orchestrator.dispatchTask(task.id, 'unknown-runner')).rejects.toThrow('not registered');
    });

    it('throws if task status is not open or blocked', async () => {
        const task = store.createTask('Task', 'Goal');
        const doneTask = { ...task, status: 'done' as const };
        store.saveTask(doneTask);
        await expect(orchestrator.dispatchTask(task.id, 'mock')).rejects.toThrow('status');
    });

    describe('dispatchTaskAsync', () => {
        it('returns a run immediately with status running', async () => {
            orchestrator.registerRunner('slow', makeSlowRunner({ status: 'completed', summary: 'Done', logs: [] }, 20));
            const task = store.createTask('Async task', 'Goal');
            const run = await orchestrator.dispatchTaskAsync(task.id, 'slow');
            expect(run.status).toBe('running');
            expect(run.endTime).toBeUndefined();
            await new Promise(r => setTimeout(r, 100)); // let background promise settle before cleanup
        });

        it('transitions task to in_progress synchronously', async () => {
            orchestrator.registerRunner('slow', makeSlowRunner({ status: 'completed', summary: 'Done', logs: [] }, 20));
            const task = store.createTask('Async task', 'Goal');
            await orchestrator.dispatchTaskAsync(task.id, 'slow');
            expect(store.getTask(task.id)?.status).toBe('in_progress');
            await new Promise(r => setTimeout(r, 100)); // let background promise settle before cleanup
        });

        it('throws synchronously if task does not exist', async () => {
            await expect(orchestrator.dispatchTaskAsync('TASK-NOPE', 'mock')).rejects.toThrow('not found');
        });

        it('throws synchronously if runner is not registered', async () => {
            const task = store.createTask('Task', 'Goal');
            await expect(orchestrator.dispatchTaskAsync(task.id, 'unknown-runner')).rejects.toThrow('not registered');
        });

        it('throws synchronously if task status is invalid', async () => {
            const task = store.createTask('Task', 'Goal');
            const doneTask = { ...task, status: 'done' as const };
            store.saveTask(doneTask);
            await expect(orchestrator.dispatchTaskAsync(task.id, 'mock')).rejects.toThrow('status');
        });

        it('background execution finalizes the run on success', async () => {
            orchestrator.registerRunner('slow', makeSlowRunner({ status: 'completed', summary: 'Background done', logs: ['ok'] }, 50));
            const task = store.createTask('Async task', 'Goal');
            const run = await orchestrator.dispatchTaskAsync(task.id, 'slow');
            await new Promise(r => setTimeout(r, 200));
            const saved = store.listRuns().find(r => r.id === run.id);
            expect(saved?.status).toBe('completed');
            expect(saved?.endTime).toBeDefined();
            expect(saved?.summary).toBe('Background done');
            expect(store.getTask(task.id)?.status).toBe('review');
        });

        it('background execution sets run to failed on runner error', async () => {
            orchestrator.registerRunner('thrower', makeThrowingRunner(50));
            const task = store.createTask('Async task', 'Goal');
            const run = await orchestrator.dispatchTaskAsync(task.id, 'thrower');
            await new Promise(r => setTimeout(r, 200));
            const saved = store.listRuns().find(r => r.id === run.id);
            expect(saved?.status).toBe('failed');
            expect(store.getTask(task.id)?.status).toBe('open');
        });

        it('background execution handles blocked runner', async () => {
            orchestrator.registerRunner('slow-blocker', makeSlowRunner({ status: 'blocked', summary: 'Needs input', logs: [], blockers: ['Missing key'] }, 50));
            const task = store.createTask('Async task', 'Goal');
            const run = await orchestrator.dispatchTaskAsync(task.id, 'slow-blocker');
            await new Promise(r => setTimeout(r, 200));
            const saved = store.listRuns().find(r => r.id === run.id);
            expect(saved?.status).toBe('completed');
            expect(store.getTask(task.id)?.status).toBe('blocked');
        });
    });
});
