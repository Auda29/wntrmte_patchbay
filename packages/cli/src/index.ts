#!/usr/env node
import { Command } from 'commander';
import { Store, Project, Orchestrator } from '@patchbay/core';
import { BashRunner } from '@patchbay/runner-bash';
import { HttpRunner } from '@patchbay/runner-http';
import { CursorRunner } from '@patchbay/runner-cursor';
import { prompt } from 'enquirer';

const program = new Command();
const store = new Store();

function getOrchestrator() {
    const orchestrator = new Orchestrator();
    orchestrator.registerRunner('bash', new BashRunner());
    orchestrator.registerRunner('http', new HttpRunner());
    orchestrator.registerRunner('cursor', new CursorRunner());
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
    .description('Dispatch a task to a runner (bash, http, cursor, etc.)')
    .action(async (taskId, runnerId) => {
        if (!store.isInitialized) return console.error('Not initialized.');

        const orchestrator = getOrchestrator();
        console.log(`Dispatching Task ${taskId} to Runner '${runnerId}'...`);
        try {
            const run = await orchestrator.dispatchTask(taskId, runnerId);
            console.log(`Run finished with status: ${run.status}`);
            console.log(`Summary: ${run.summary}`);
        } catch (err: any) {
            console.error(`Run failed:`, err.message);
        }
    });

program.parse(process.argv);
