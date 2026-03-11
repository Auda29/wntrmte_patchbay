#!/usr/bin/env node
import { Command } from 'commander';
import { Store, Project, Orchestrator, loadConfig, saveConfig, maskApiKey } from '@patchbay/core';
import { BashRunner } from '@patchbay/runner-bash';
import { HttpRunner } from '@patchbay/runner-http';
import { CursorRunner } from '@patchbay/runner-cursor';
import { ClaudeCodeRunner } from '@patchbay/runner-claude-code';
import { CursorCliRunner } from '@patchbay/runner-cursor-cli';
import { CodexRunner } from '@patchbay/runner-codex';
import { GeminiRunner } from '@patchbay/runner-gemini';
import { prompt } from 'enquirer';

const program = new Command();
const store = new Store();

function getOrchestrator() {
    const cfg = loadConfig();
    const r = cfg.runners;
    const orchestrator = new Orchestrator();
    orchestrator.registerRunner('bash', new BashRunner());
    orchestrator.registerRunner('http', new HttpRunner());
    orchestrator.registerRunner('cursor', new CursorRunner());
    orchestrator.registerRunner('claude-code', new ClaudeCodeRunner(r['claude-code']));
    orchestrator.registerRunner('cursor-cli', new CursorCliRunner(r['cursor-cli']));
    orchestrator.registerRunner('codex', new CodexRunner(r['codex']));
    orchestrator.registerRunner('gemini', new GeminiRunner(r['gemini']));
    return orchestrator;
}

program
    .name('patchbay')
    .description('A lightweight control plane for AI-assisted software development.')
    .version('0.1.0');

program
    .command('init')
    .description('Interactive initialization of a new Patchbay project')
    .action(async () => {
        if (store.isInitialized) {
            console.error('Error: Patchbay is already initialized in this repository.');
            process.exit(1);
        }

        try {
            const response = await prompt<{ name: string, goal: string, techStack: string }>([
                {
                    type: 'input',
                    name: 'name',
                    message: 'Project Name?',
                    initial: 'My Patchbay Project'
                },
                {
                    type: 'input',
                    name: 'goal',
                    message: 'Main Goal of this project?',
                    initial: 'To build awesome software'
                },
                {
                    type: 'input',
                    name: 'techStack',
                    message: 'Tech Stack (comma separated)?',
                    initial: 'Node.js, TypeScript'
                }
            ]);

            const newProject: Project = {
                name: response.name,
                goal: response.goal,
                rules: ['Write clean, maintainable code.', 'Document architectural decisions.'],
                techStack: response.techStack.split(',').map(s => s.trim()).filter(Boolean)
            };

            store.init(newProject);
            console.log('\nSuccess! Patchbay initialized in .project-agents/');
        } catch (err: any) {
            console.error('\nInitialization failed:', err.message || err);
            process.exit(1);
        }
    });

program
    .command('status')
    .description('Show current project and task status')
    .action(() => {
        if (!store.isInitialized) {
            console.error('Patchbay is not initialized. Run `patchbay init`.');
            return;
        }
        const project = store.getProject();
        const tasks = store.listTasks();

        console.log(`\n=== Patchbay Project: ${project.name} ===`);
        console.log(`Goal: ${project.goal}`);
        console.log(`\nActive Tasks:`);
        const active = tasks.filter(t => t.status === 'in_progress' || t.status === 'review');
        if (active.length === 0) console.log('  No active tasks.');
        active.forEach(t => console.log(`  [${t.status}] ${t.id} - ${t.title}`));

        console.log(`\nBlocked Tasks:`);
        const blocked = tasks.filter(t => t.status === 'blocked');
        if (blocked.length === 0) console.log('  No blocked tasks.');
        blocked.forEach(t => console.log(`  [${t.status}] ${t.id} - ${t.title}`));
    });

const taskCmd = program.command('task').description('Manage tasks');

taskCmd
    .command('create')
    .description('Interactively create a new task')
    .action(async () => {
        if (!store.isInitialized) return console.error('Not initialized.');
        try {
            const resp = await prompt<{ title: string, goal: string }>([
                { type: 'input', name: 'title', message: 'Task Title:' },
                { type: 'input', name: 'goal', message: 'Task Goal/Description:' }
            ]);

            const task = store.createTask(resp.title, resp.goal);
            console.log(`\nCreated task ${task.id}: ${task.title}`);
        } catch (err) {
            console.error('Task creation aborted.');
        }
    });

taskCmd
    .command('list')
    .description('List all tasks')
    .action(() => {
        if (!store.isInitialized) return console.error('Not initialized.');
        const tasks = store.listTasks();
        tasks.forEach(t => console.log(`[${t.status}] ${t.id} - ${t.title}`));
    });

taskCmd
    .command('status <id>')
    .description('View details of a specific task')
    .action((id) => {
        if (!store.isInitialized) return console.error('Not initialized.');
        const task = store.getTask(id);
        if (!task) return console.error(`Task ${id} not found.`);
        console.log(`\n=== Task ${task.id} ===`);
        console.log(`Title:  ${task.title}`);
        console.log(`Status: ${task.status}`);
        console.log(`Goal:   ${task.goal || 'None'}`);
        if (task.affectedFiles?.length) {
            console.log(`Files:  ${task.affectedFiles.join(', ')}`);
        }
    });

program
    .command('run <taskId> <runnerId>')
    .description('Dispatch a task to a runner (bash, http, cursor, claude-code, codex, gemini, etc.)')
    .action(async (taskId, runnerId) => {
        if (!store.isInitialized) {
            console.error('Not initialized.');
            process.exitCode = 1;
            return;
        }

        const orchestrator = getOrchestrator();
        console.log(`Dispatching Task ${taskId} to Runner '${runnerId}'...`);
        try {
            const run = await orchestrator.dispatchTask(taskId, runnerId);
            console.log(`Run finished with status: ${run.status}`);
            console.log(`Summary: ${run.summary}`);
            if (run.status === 'failed') {
                process.exitCode = 1;
            }
        } catch (err: any) {
            console.error(`Run failed:`, err.message);
            process.exitCode = 1;
        }
    });

// --- Auth commands ---

const authCmd = program.command('auth').description('Manage runner authentication');

authCmd
    .command('set <runner>')
    .description('Configure authentication for a runner')
    .option('--api-key <key>', 'API key for the runner')
    .option('--subscription', 'Use CLI subscription/login auth')
    .action((runner: string, opts: { apiKey?: string; subscription?: boolean }) => {
        if (!opts.apiKey && !opts.subscription) {
            console.error('Specify --api-key <key> or --subscription.');
            process.exit(1);
        }

        const cfg = loadConfig();

        if (opts.subscription) {
            cfg.runners[runner] = { mode: 'subscription' };
        } else if (opts.apiKey) {
            cfg.runners[runner] = { mode: 'apiKey', apiKey: opts.apiKey };
        }

        saveConfig(cfg);
        console.log(`Auth for '${runner}' saved.`);
    });

authCmd
    .command('list')
    .description('List configured runner authentication')
    .action(() => {
        const cfg = loadConfig();
        const entries = Object.entries(cfg.runners);

        if (entries.length === 0) {
            console.log('No runner auth configured. Use `patchbay auth set <runner>`.');
            return;
        }

        for (const [runner, auth] of entries) {
            if (auth.mode === 'subscription') {
                console.log(`  ${runner.padEnd(14)} subscription`);
            } else {
                console.log(`  ${runner.padEnd(14)} apiKey  ${maskApiKey(auth.apiKey)}`);
            }
        }
    });

authCmd
    .command('clear <runner>')
    .description('Remove authentication for a runner')
    .action((runner: string) => {
        const cfg = loadConfig();

        if (!cfg.runners[runner]) {
            console.error(`No auth configured for '${runner}'.`);
            return;
        }

        delete cfg.runners[runner];
        saveConfig(cfg);
        console.log(`Auth for '${runner}' cleared.`);
    });

program.parse(process.argv);
