import { Store } from './store';
import { Runner } from './runner';
import { Run, Task } from './types';

export class Orchestrator {
    private store: Store;
    private runners: Map<string, Runner>;

    constructor(targetRepoPath: string = process.cwd()) {
        this.store = new Store(targetRepoPath);
        this.runners = new Map();
    }

    registerRunner(id: string, runner: Runner) {
        this.runners.set(id, runner);
    }

    async dispatchTask(taskId: string, runnerId: string): Promise<Run> {
        if (!this.store.isInitialized) {
            throw new Error('Patchbay is not initialized.');
        }

        const task = this.store.getTask(taskId);
        if (!task) throw new Error(`Task ${taskId} not found.`);

        const runner = this.runners.get(runnerId);
        if (!runner) throw new Error(`Runner ${runnerId} not registered.`);

        // State transition
        if (task.status !== 'open' && task.status !== 'blocked') {
            throw new Error(`Cannot run task in status ${task.status}.`);
        }

        task.status = 'in_progress';
        this.store.saveTask(task);

        const startTimeLabel = new Date().toISOString();
        const runId = `${startTimeLabel.replace(/[:.]/g, '-')}-${taskId}-${runnerId}`;
        const run: Run = {
            id: runId,
            taskId,
            runner: runnerId,
            startTime: startTimeLabel,
            status: 'running'
        };
        this.store.saveRun(run);

        const project = this.store.getProject();
        const repoPath = project.repoPath || process.cwd();
        const projectRules = project.rules ? project.rules.join('\n') : undefined;
        const contextFiles = this.store.getContextFiles();

        try {
            const output = await runner.execute({
                taskId,
                repoPath,
                branch: 'main',
                affectedFiles: task.affectedFiles,
                contextFiles,
                projectRules,
                goal: task.goal || task.description || task.title || ''
            });

            if (output.status === 'blocked') {
                run.status = 'completed'; // The run finished trying, yielding a blocker
                task.status = 'blocked';
            } else {
                run.status = output.status;
                if (output.status === 'completed') task.status = 'review';
                else task.status = 'open';
            }

            run.endTime = new Date().toISOString();
            run.logs = output.logs;
            run.summary = output.summary;
            run.diffRef = output.diffRef;
            run.blockers = output.blockers;
            run.suggestedNextSteps = output.suggestedNextSteps;

        } catch (err: any) {
            run.status = 'failed';
            run.endTime = new Date().toISOString();
            run.logs = [err.message, err.stack];
            task.status = 'open';
        }

        this.store.saveRun(run);
        this.store.saveTask(task);

        return run;
    }
}
