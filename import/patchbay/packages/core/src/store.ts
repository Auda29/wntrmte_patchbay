import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { randomUUID } from 'crypto';
import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { Project, Task, Run, Decision, AgentProfile } from './types';

function slugifyTaskTitle(title: string): string {
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);

    return slug || 'task';
}

export class Store {
    private baseDir: string;
    private ajv: Ajv;
    private validateProject: ValidateFunction;
    private validateTask: ValidateFunction;
    private validateRun: ValidateFunction;
    private validateDecision: ValidateFunction;

    constructor(targetRepoPath: string = process.cwd()) {
        this.baseDir = path.join(targetRepoPath, '.project-agents');
        this.ajv = new Ajv({ allErrors: true });
        addFormats(this.ajv);

        // Try importing copied schemas (or local in monorepo during dev)
        // __dirname in dist/ is packages/core/dist. Schemas are in packages/core/schema
        let schemaDir = path.join(__dirname, '../schema');
        if (!fs.existsSync(schemaDir)) {
            // Fallback for dev/ts-node where __dirname is src/
            schemaDir = path.join(__dirname, '../../schema');
            if (!fs.existsSync(schemaDir)) {
                // Fallback for direct repo usage
                schemaDir = path.resolve(process.cwd(), 'schema');
            }
        }

        const loadSchema = (name: string) => {
            const p = path.join(schemaDir, name);
            if (!fs.existsSync(p)) return {}; // Mock or skip if missing in dev
            return JSON.parse(fs.readFileSync(p, 'utf8'));
        };

        this.validateProject = this.ajv.compile(loadSchema('project.schema.json'));
        this.validateTask = this.ajv.compile(loadSchema('task.schema.json'));
        this.validateRun = this.ajv.compile(loadSchema('run.schema.json'));
        this.validateDecision = this.ajv.compile(loadSchema('decision.schema.json'));
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
        const project = yaml.parse(content) as Project;

        if (!this.validateProject(project)) {
            console.error('Project schema validation errors:', this.ajv.errorsText(this.validateProject.errors));
            throw new Error('project.yml fails schema validation');
        }
        return project;
    }

    saveProject(project: Project) {
        if (!this.validateProject(project)) {
            console.error('Project schema validation errors:', this.ajv.errorsText(this.validateProject.errors));
            throw new Error('project.yml fails schema validation');
        }

        const projectYaml = yaml.stringify(project);
        fs.writeFileSync(path.join(this.baseDir, 'project.yml'), projectYaml);
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
        if (!this.validateTask(task)) {
            const taskId = (task as any).id || 'unknown';
            console.error(`Task ${taskId} schema validation errors:`, this.ajv.errorsText(this.validateTask.errors));
            throw new Error(`Task ${taskId} fails schema validation`);
        }
        const tasksDir = path.join(this.baseDir, 'tasks');
        fs.writeFileSync(path.join(tasksDir, `${task.id}.yml`), yaml.stringify(task));
    }

    saveRun(run: Run) {
        if (!this.validateRun(run)) {
            const runId = (run as any).id || 'unknown';
            console.error(`Run ${runId} schema validation errors:`, this.ajv.errorsText(this.validateRun.errors));
            throw new Error(`Run ${runId} fails schema validation`);
        }
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

    getContextFiles(): string[] {
        const contextDir = path.join(this.baseDir, 'context');
        if (!fs.existsSync(contextDir)) return [];
        return fs.readdirSync(contextDir)
            .filter(f => fs.statSync(path.join(contextDir, f)).isFile())
            .map(f => {
                const content = fs.readFileSync(path.join(contextDir, f), 'utf-8');
                return `--- ${f} ---\n${content}`;
            });
    }

    createTask(title: string, goal: string, affectedFiles?: string[]): Task {
        const slug = slugifyTaskTitle(title);
        const suffix = randomUUID().slice(0, 8);
        const id = `TASK-${slug}-${suffix}`;
        const task: Task = { id, title, goal, affectedFiles, status: 'open' };
        this.saveTask(task);
        return task;
    }

    createDecision(title: string, rationale: string, proposedBy?: string): Decision {
        const id = `DEC-${Date.now()}`;
        const decision: Decision = { id, title, rationale, proposedBy, timestamp: new Date().toISOString() };
        if (!this.validateDecision(decision)) {
            const decId = (decision as any).id || id;
            console.error(`Decision ${decId} validation errors:`, this.ajv.errorsText(this.validateDecision.errors));
            throw new Error(`Decision ${decId} fails validation`);
        }
        const decisionsDir = path.join(this.baseDir, 'decisions');
        fs.writeFileSync(path.join(decisionsDir, `${id}.json`), JSON.stringify(decision, null, 2));
        return decision;
    }
}
