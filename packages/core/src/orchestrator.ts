import { Store } from './store';
import { Runner, RunnerInput, RunnerOutput, ConversationTurn } from './runner';
import { AgentConnector, AgentSession, AgentEvent, ConnectorRegistry } from './connector';
import { Run, Task } from './types';
import { randomUUID } from 'crypto';

export class Orchestrator {
    private store: Store;
    private runners: Map<string, Runner>;
    private connectorRegistry: ConnectorRegistry;
    private activeSessions: Map<string, { session: AgentSession; run: Run; taskId: string }>;

    constructor(targetRepoPath: string = process.cwd()) {
        this.store = new Store(targetRepoPath);
        this.runners = new Map();
        this.connectorRegistry = new ConnectorRegistry();
        this.activeSessions = new Map();
    }

    registerRunner(id: string, runner: Runner) {
        this.runners.set(id, runner);
    }

    // -----------------------------------------------------------------------
    // Connector Registration
    // -----------------------------------------------------------------------

    registerConnector(connector: AgentConnector): void {
        this.connectorRegistry.register(connector);
    }

    listConnectors(): AgentConnector[] {
        return this.connectorRegistry.list();
    }

    // -----------------------------------------------------------------------
    // Live Agent Sessions
    // -----------------------------------------------------------------------

    async connectAgent(taskId: string, connectorId: string): Promise<AgentSession> {
        if (!this.store.isInitialized) {
            throw new Error('Patchbay is not initialized.');
        }

        const task = this.store.getTask(taskId);
        if (!task) throw new Error(`Task ${taskId} not found.`);

        const connector = this.connectorRegistry.get(connectorId);
        if (!connector) throw new Error(`Connector ${connectorId} not registered.`);

        if (task.status !== 'open' && task.status !== 'blocked' && task.status !== 'awaiting_input') {
            throw new Error(`Cannot connect agent for task in status ${task.status}.`);
        }

        task.status = 'in_progress';
        this.store.saveTask(task);

        const project = this.store.getProject();
        const repoPath = project.repoPath || process.cwd();
        const projectRules = project.rules ? project.rules.join('\n') : undefined;
        const contextFiles = this.store.getContextFiles();

        const startTimeLabel = new Date().toISOString();
        const runId = `${startTimeLabel.replace(/[:.]/g, '-')}-${taskId}-${connectorId}`;
        const conversationId = randomUUID();

        const run: Run = {
            id: runId,
            taskId,
            runner: connectorId,
            startTime: startTimeLabel,
            status: 'running',
            conversationId,
            turnIndex: 0,
        };
        this.store.saveRun(run);

        const input: RunnerInput = {
            taskId,
            repoPath,
            branch: 'main',
            affectedFiles: task.affectedFiles,
            contextFiles,
            projectRules,
            goal: task.goal || task.description || task.title || '',
        };

        const session = await connector.connect(input);

        // Track the active session
        this.activeSessions.set(session.sessionId, { session, run, taskId });
        run.sessionId = session.sessionId;
        this.store.saveRun(run);

        // Bridge session events to store updates
        this.bridgeSessionEvents(session, run, task);

        return session;
    }

    /** Send a text reply to an active session */
    async sendInput(sessionId: string, text: string): Promise<void> {
        const entry = this.activeSessions.get(sessionId);
        if (!entry) throw new Error(`No active session ${sessionId}`);
        await entry.session.sendInput(text);
    }

    /** Approve a pending permission request in an active session */
    async approveSession(sessionId: string, permissionId: string): Promise<void> {
        const entry = this.activeSessions.get(sessionId);
        if (!entry) throw new Error(`No active session ${sessionId}`);
        await entry.session.approve(permissionId);
    }

    /** Deny a pending permission request in an active session */
    async denySession(sessionId: string, permissionId: string): Promise<void> {
        const entry = this.activeSessions.get(sessionId);
        if (!entry) throw new Error(`No active session ${sessionId}`);
        await entry.session.deny(permissionId);
    }

    /** Cancel / abort an active session */
    async cancelSession(sessionId: string): Promise<void> {
        const entry = this.activeSessions.get(sessionId);
        if (!entry) throw new Error(`No active session ${sessionId}`);
        await entry.session.cancel();
    }

    /** Get an active session by ID */
    getSession(sessionId: string): AgentSession | undefined {
        return this.activeSessions.get(sessionId)?.session;
    }

    /** List all active session IDs */
    listSessions(): string[] {
        return Array.from(this.activeSessions.keys());
    }

    private bridgeSessionEvents(session: AgentSession, run: Run, task: Task): void {
        const logs: string[] = [];

        session.on('event', (event: AgentEvent) => {
            switch (event.type) {
                case 'agent:message':
                    logs.push(event.content);
                    break;

                case 'agent:tool_use':
                    if (event.status === 'started') {
                        logs.push(`[tool] ${event.toolName}`);
                    }
                    break;

                case 'agent:question':
                    run.status = 'awaiting_input';
                    run.question = event.question;
                    task.status = 'awaiting_input';
                    this.store.saveRun(run);
                    this.store.saveTask(task);
                    break;

                case 'agent:permission':
                    run.status = 'awaiting_input';
                    task.status = 'awaiting_input';
                    this.store.saveRun(run);
                    this.store.saveTask(task);
                    break;

                case 'session:completed':
                    run.status = 'completed';
                    run.endTime = new Date().toISOString();
                    run.summary = event.summary ?? (logs.join('').slice(0, 500) || 'Session completed.');
                    run.logs = logs;
                    task.status = 'review';
                    this.store.saveRun(run);
                    this.store.saveTask(task);
                    break;

                case 'session:failed':
                    run.status = 'failed';
                    run.endTime = new Date().toISOString();
                    run.summary = `Session failed: ${event.error}`;
                    run.logs = logs;
                    task.status = 'open';
                    this.store.saveRun(run);
                    this.store.saveTask(task);
                    break;
            }
        });

        session.on('close', () => {
            this.activeSessions.delete(session.sessionId);
        });
    }

    private preflight(taskId: string, runnerId: string): {
        task: Task;
        runner: Runner;
        run: Run;
        repoPath: string;
        projectRules: string | undefined;
        contextFiles: string[];
    } {
        if (!this.store.isInitialized) {
            throw new Error('Patchbay is not initialized.');
        }

        const task = this.store.getTask(taskId);
        if (!task) throw new Error(`Task ${taskId} not found.`);

        const runner = this.runners.get(runnerId);
        if (!runner) throw new Error(`Runner ${runnerId} not registered.`);

        if (task.status !== 'open' && task.status !== 'blocked' && task.status !== 'awaiting_input') {
            throw new Error(`Cannot run task in status ${task.status}.`);
        }

        task.status = 'in_progress';
        this.store.saveTask(task);

        const conversationId = randomUUID();
        const startTimeLabel = new Date().toISOString();
        const runId = `${startTimeLabel.replace(/[:.]/g, '-')}-${taskId}-${runnerId}`;
        const run: Run = {
            id: runId,
            taskId,
            runner: runnerId,
            startTime: startTimeLabel,
            status: 'running',
            conversationId,
            turnIndex: 0,
        };
        this.store.saveRun(run);

        const project = this.store.getProject();
        const repoPath = project.repoPath || process.cwd();
        const projectRules = project.rules ? project.rules.join('\n') : undefined;
        const contextFiles = this.store.getContextFiles();

        return { task, runner, run, repoPath, projectRules, contextFiles };
    }

    private buildInput(taskId: string, task: Task, repoPath: string, projectRules: string | undefined, contextFiles: string[]): RunnerInput {
        return {
            taskId,
            repoPath,
            branch: 'main',
            affectedFiles: task.affectedFiles,
            contextFiles,
            projectRules,
            goal: task.goal || task.description || task.title || ''
        };
    }

    private finalize(run: Run, task: Task, output: RunnerOutput) {
        if (output.status === 'awaiting_input') {
            run.status = 'awaiting_input';
            task.status = 'awaiting_input';
        } else if (output.status === 'blocked') {
            run.status = 'completed';
            task.status = 'blocked';
        } else {
            run.status = output.status;
            if (output.status === 'completed') task.status = 'review';
            else task.status = 'open';
        }
        run.endTime = new Date().toISOString();
        run.logs = output.logs;
        run.summary = output.summary;
        run.question = output.question;
        run.diffRef = output.diffRef;
        run.blockers = output.blockers;
        run.suggestedNextSteps = output.suggestedNextSteps;
        run.installHint = output.installHint;
        if (output.sessionId) run.sessionId = output.sessionId;
    }

    private setFailed(run: Run, task: Task, err: any) {
        run.status = 'failed';
        run.endTime = new Date().toISOString();
        run.summary = `Runner error: ${err.message || String(err)}`;
        run.logs = [err.message, err.stack];
        task.status = 'open';
    }

    /** Build conversation history from previous runs in the same thread. */
    private buildConversationHistory(runs: Run[]): ConversationTurn[] {
        const sorted = [...runs].sort((a, b) => (a.turnIndex ?? 0) - (b.turnIndex ?? 0));
        const turns: ConversationTurn[] = [];

        for (const r of sorted) {
            const content = r.logs?.join('') ?? r.summary ?? '';
            if ((r.turnIndex ?? 0) > 0) {
                // Even turns after the first are user replies (goal was stored as summary prefix)
                turns.push({ role: 'user', content: r.summary ?? '', timestamp: r.startTime });
            }
            turns.push({
                role: 'assistant',
                content,
                timestamp: r.endTime ?? r.startTime,
            });
        }

        return turns;
    }

    async dispatchTask(taskId: string, runnerId: string): Promise<Run> {
        const { task, runner, run, repoPath, projectRules, contextFiles } = this.preflight(taskId, runnerId);

        try {
            const output = await runner.execute(this.buildInput(taskId, task, repoPath, projectRules, contextFiles));
            this.finalize(run, task, output);
        } catch (err: any) {
            this.setFailed(run, task, err);
        }

        this.store.saveRun(run);
        this.store.saveTask(task);

        return run;
    }

    async dispatchTaskAsync(taskId: string, runnerId: string): Promise<Run> {
        const { task, runner, run, repoPath, projectRules, contextFiles } = this.preflight(taskId, runnerId);

        // Fire-and-forget: detached execution, caller receives the running Run immediately
        runner.execute(this.buildInput(taskId, task, repoPath, projectRules, contextFiles))
            .then((output) => {
                this.finalize(run, task, output);
                this.store.saveRun(run);
                this.store.saveTask(task);
            })
            .catch((err: any) => {
                this.setFailed(run, task, err);
                this.store.saveRun(run);
                this.store.saveTask(task);
            });

        return run;
    }

    /** Continue an existing conversation by replying to a runner's question. */
    async continueConversation(conversationId: string, userReply: string, runnerId: string): Promise<Run> {
        if (!this.store.isInitialized) {
            throw new Error('Patchbay is not initialized.');
        }

        // Find all runs in this conversation thread
        const allRuns = this.store.listRuns();
        const threadRuns = allRuns
            .filter(r => r.conversationId === conversationId)
            .sort((a, b) => (a.turnIndex ?? 0) - (b.turnIndex ?? 0));

        const lastRun = threadRuns[threadRuns.length - 1];
        if (!lastRun) throw new Error(`No runs found for conversation ${conversationId}`);

        const task = this.store.getTask(lastRun.taskId);
        if (!task) throw new Error(`Task ${lastRun.taskId} not found.`);

        const runner = this.runners.get(runnerId);
        if (!runner) throw new Error(`Runner ${runnerId} not registered.`);

        task.status = 'in_progress';
        this.store.saveTask(task);

        const project = this.store.getProject();
        const repoPath = project.repoPath || process.cwd();
        const projectRules = project.rules ? project.rules.join('\n') : undefined;
        const contextFiles = this.store.getContextFiles();

        const turnIndex = (lastRun.turnIndex ?? 0) + 1;
        const startTimeLabel = new Date().toISOString();
        const runId = `${startTimeLabel.replace(/[:.]/g, '-')}-${lastRun.taskId}-${runnerId}-t${turnIndex}`;

        const run: Run = {
            id: runId,
            taskId: lastRun.taskId,
            runner: runnerId,
            startTime: startTimeLabel,
            status: 'running',
            conversationId,
            turnIndex,
        };
        this.store.saveRun(run);

        const input: RunnerInput = {
            taskId: lastRun.taskId,
            repoPath,
            branch: 'main',
            affectedFiles: task.affectedFiles,
            contextFiles,
            projectRules,
            goal: userReply,
            conversationId,
            resumeSessionId: lastRun.sessionId,
            previousTurns: this.buildConversationHistory(threadRuns),
        };

        try {
            const output = await runner.execute(input);
            this.finalize(run, task, output);
            if (output.sessionId) run.sessionId = output.sessionId;
        } catch (err: any) {
            this.setFailed(run, task, err);
        }

        this.store.saveRun(run);
        this.store.saveTask(task);

        return run;
    }
}
