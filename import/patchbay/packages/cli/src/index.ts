#!/usr/bin/env node
import { once } from 'events';
import * as path from 'path';
import { Command } from 'commander';
import { Store, Project, Run, loadConfig, saveConfig, maskApiKey } from '@patchbay/core';
import { createConfiguredOrchestrator, createServer } from '@patchbay/server';
import { prompt } from 'enquirer';
import * as readline from 'readline';
import { bootstrapContextFiles, detectProjectMeta } from './init-meta';

const program = new Command();
const store = new Store();

function getOrchestrator() {
    return createConfiguredOrchestrator();
}

program
    .name('patchbay')
    .description('A lightweight control plane for AI-assisted software development.')
    .version('0.1.0');

program
    .command('init')
    .description('Initialize a new Patchbay project (interactive or non-interactive)')
    .option('--name <name>', 'Project name')
    .option('--goal <goal>', 'Main goal of the project')
    .option('--tech-stack <stack>', 'Tech stack (comma separated)')
    .option('-y, --yes', 'Non-interactive mode — use provided values or defaults')
    .action(async (opts: { name?: string; goal?: string; techStack?: string; yes?: boolean }) => {
        if (store.isInitialized) {
            console.error('Error: Patchbay is already initialized in this repository.');
            process.exit(1);
        }

        try {
            const detected = detectProjectMeta(process.cwd());
            const defaults = {
                name: detected.name || path.basename(process.cwd()) || 'My Patchbay Project',
                goal: detected.goal || 'To build awesome software',
                techStack: detected.techStack.join(', ') || 'Node.js, TypeScript'
            };

            let name: string;
            let goal: string;
            let techStack: string;

            if (opts.yes) {
                name = opts.name || defaults.name;
                goal = opts.goal || defaults.goal;
                techStack = opts.techStack || defaults.techStack;
            } else {
                const response = await prompt<{ name: string, goal: string, techStack: string }>([
                    {
                        type: 'input',
                        name: 'name',
                        message: 'Project Name?',
                        initial: opts.name || defaults.name
                    },
                    {
                        type: 'input',
                        name: 'goal',
                        message: 'Main Goal of this project?',
                        initial: opts.goal || defaults.goal
                    },
                    {
                        type: 'input',
                        name: 'techStack',
                        message: 'Tech Stack (comma separated)?',
                        initial: opts.techStack || defaults.techStack
                    }
                ]);
                name = response.name;
                goal = response.goal;
                techStack = response.techStack;
            }

            const newProject: Project = {
                name,
                goal,
                rules: ['Write clean, maintainable code.', 'Document architectural decisions.'],
                techStack: techStack.split(',').map(s => s.trim()).filter(Boolean)
            };

            store.init(newProject);
            bootstrapContextFiles(process.cwd(), detected);
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

/** Ask the user for a reply on stdin (TTY only). Returns empty string if skipped. */
function askReply(question: string): Promise<string> {
    if (!process.stdin.isTTY) return Promise.resolve('');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise<string>((resolve) => {
        console.log(`\nQuestion: "${question}"`);
        rl.question('Reply (Enter to skip): ', (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

/** Print run result and return whether it needs a reply. */
function printRunResult(run: Run): boolean {
    console.log(`Run finished with status: ${run.status}`);
    console.log(`Summary: ${run.summary ?? '(no summary)'}`);
    if (run.status === 'failed') {
        if (run.logs?.length) {
            console.error(`\nLogs:\n${run.logs.join('\n')}`);
        }
        if (run.installHint) {
            console.log(`\nInstall hint: ${run.installHint}`);
        }
        process.exitCode = 1;
    }
    // Check if the task is now awaiting_input (runner asked a question)
    const taskStatus = store.getTask(run.taskId)?.status;
    return taskStatus === 'awaiting_input' && !!run.conversationId;
}

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
            let run = await orchestrator.dispatchTask(taskId, runnerId);
            let needsReply = printRunResult(run);

            // Interactive follow-up loop: if the runner asks a question, prompt the user
            while (needsReply && run.conversationId) {
                const question = run.summary ?? 'The runner is asking for more information.';
                const reply = await askReply(question);
                if (!reply) break;

                console.log(`\nContinuing conversation...`);
                run = await orchestrator.continueConversation(run.conversationId, reply, runnerId);
                needsReply = printRunResult(run);
            }
        } catch (err: any) {
            console.error(`Run failed:`, err.message);
            process.exitCode = 1;
        }
    });

program
    .command('reply <conversationId> <message>')
    .description('Continue a conversation by replying to a runner\'s question')
    .option('--runner <runnerId>', 'Runner to use for the reply')
    .action(async (conversationId, message, opts) => {
        if (!store.isInitialized) {
            console.error('Not initialized.');
            process.exitCode = 1;
            return;
        }

        const orchestrator = getOrchestrator();

        // Determine runner from the last run in the conversation
        const allRuns = store.listRuns();
        const threadRuns = allRuns.filter(r => r.conversationId === conversationId);
        if (threadRuns.length === 0) {
            console.error(`No runs found for conversation ${conversationId}`);
            process.exitCode = 1;
            return;
        }
        const lastRun = threadRuns.sort((a, b) => (b.turnIndex ?? 0) - (a.turnIndex ?? 0))[0];
        const runnerId = opts.runner ?? lastRun.runner;

        console.log(`Continuing conversation ${conversationId} with runner '${runnerId}'...`);
        try {
            const run = await orchestrator.continueConversation(conversationId, message, runnerId);
            printRunResult(run);
        } catch (err: any) {
            console.error(`Reply failed:`, err.message);
            process.exitCode = 1;
        }
    });

program
    .command('serve')
    .description('Start the standalone Patchbay HTTP server')
    .option('--port <port>', 'Port to bind the server to', '3001')
    .option('--host <host>', 'Host to bind the server to', '127.0.0.1')
    .option('--repo-root <path>', 'Repository root to serve', process.cwd())
    .action(async (opts: { port: string; host: string; repoRoot: string }) => {
        const port = Number.parseInt(opts.port, 10);
        if (Number.isNaN(port) || port <= 0) {
            console.error(`Invalid port: ${opts.port}`);
            process.exitCode = 1;
            return;
        }

        try {
            const server = await createServer({
                repoRoot: opts.repoRoot,
                port,
                host: opts.host
            });

            server.listen(port, opts.host);
            await once(server, 'listening');

            console.log(`Patchbay server listening on http://${opts.host}:${port}`);
        } catch (err: any) {
            console.error(`Server failed:`, err.message);
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
