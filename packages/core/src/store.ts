import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { Project, Task, Run, Decision, AgentProfile } from './types';

export class Store {
    private baseDir: string;

    constructor(targetRepoPath: string = process.cwd()) {
        this.baseDir = path.join(targetRepoPath, '.project-agents');
    }

    get isInitialized(): boolean {
        return fs.existsSync(this.baseDir);
    }

    init(initialProject: Project) {
        if (this.isInitialized) {
            throw new Error(`Directory ${this.baseDir} already exists.`);
        }

        // Create main structure
        fs.mkdirSync(this.baseDir, { recursive: true });
        fs.mkdirSync(path.join(this.baseDir, 'agents'));
        fs.mkdirSync(path.join(this.baseDir, 'tasks'));
        fs.mkdirSync(path.join(this.baseDir, 'decisions'));
        fs.mkdirSync(path.join(this.baseDir, 'runs'));
        fs.mkdirSync(path.join(this.baseDir, 'context'));

        // Write initial project file
        const projectYaml = yaml.stringify(initialProject);
        fs.writeFileSync(path.join(this.baseDir, 'project.yml'), projectYaml);
    }

    getProject(): Project {
        const projectFile = path.join(this.baseDir, 'project.yml');
        if (!fs.existsSync(projectFile)) {
            throw new Error(`No project.yml found in ${this.baseDir}`);
        }
        const content = fs.readFileSync(projectFile, 'utf8');
        return yaml.parse(content) as Project;
    }

    listTasks(): Task[] {
        const tasksDir = path.join(this.baseDir, 'tasks');
        if (!fs.existsSync(tasksDir)) return [];

        return fs.readdirSync(tasksDir)
            .filter(f => f.endsWith('.json') || f.endsWith('.yml'))
            .map(f => {
                const content = fs.readFileSync(path.join(tasksDir, f), 'utf-8');
                return yaml.parse(content) as Task;
            });
    }

    getTask(id: string): Task | null {
        const tasks = this.listTasks();
        return tasks.find(t => t.id === id) || null;
    }

    saveTask(task: Task) {
        const tasksDir = path.join(this.baseDir, 'tasks');
        fs.writeFileSync(path.join(tasksDir, `${task.id}.yml`), yaml.stringify(task));
    }

    saveRun(run: Run) {
        const runsDir = path.join(this.baseDir, 'runs');
        fs.writeFileSync(path.join(runsDir, `${run.id}.json`), JSON.stringify(run, null, 2));
    }

    listRuns(taskId?: string): Run[] {
        const runsDir = path.join(this.baseDir, 'runs');
        if (!fs.existsSync(runsDir)) return [];

        let runs = fs.readdirSync(runsDir)
            .filter(f => f.endsWith('.json'))
            .map(f => {
                const content = fs.readFileSync(path.join(runsDir, f), 'utf-8');
                return JSON.parse(content) as Run;
            });
        if (taskId) runs = runs.filter(r => r.taskId === taskId);
        return runs;
    }

    listDecisions(): Decision[] {
        const decisionsDir = path.join(this.baseDir, 'decisions');
        if (!fs.existsSync(decisionsDir)) return [];

        return fs.readdirSync(decisionsDir)
            .filter(f => f.endsWith('.json') || f.endsWith('.md'))
            .map(f => {
                const content = fs.readFileSync(path.join(decisionsDir, f), 'utf-8');
                try {
                    return JSON.parse(content) as Decision;
                } catch {
                    return { id: f, title: f, rationale: content, timestamp: new Date().toISOString() } as Decision;
                }
            });
    }
}
