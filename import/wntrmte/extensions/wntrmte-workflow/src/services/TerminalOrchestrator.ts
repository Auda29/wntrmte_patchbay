import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec, execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { Run } from '../store/types';
import { getPatchbayCliExecutable } from './SetupInspector';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

export interface CliInstallPlan {
  label: string;
  detail: string;
  terminalName: string;
  terminalCwd?: string;
  commands: string[];
}

export interface TerminalPlan {
  label: string;
  detail: string;
  cwd?: string;
  env?: Record<string, string>;
  command: string;
  args: string[];
}

interface CommandExecutionError extends Error {
  stderr?: string;
  stdout?: string;
}

export function runTerminalPlan(plan: CliInstallPlan | TerminalPlan): void {
  if ('commands' in plan) {
    const terminal = vscode.window.createTerminal({
      name: plan.terminalName,
      cwd: plan.terminalCwd,
      env: 'env' in plan ? plan.env : undefined,
    });
    terminal.show(true);

    for (const command of plan.commands) {
      terminal.sendText(command, true);
    }
    return;
  }

  const terminal = vscode.window.createTerminal({
    name: plan.label,
    cwd: plan.cwd,
    env: plan.env,
  });
  terminal.show(true);
  terminal.sendText([plan.command, ...plan.args].map(quoteShellArg).join(' '), true);
}

export function runTerminalPlanInBackground(plan: TerminalPlan): vscode.Terminal {
  const terminal = vscode.window.createTerminal({
    name: plan.label,
    cwd: plan.cwd,
    env: plan.env,
  });

  terminal.show(true);
  terminal.sendText([plan.command, ...plan.args].map(quoteShellArg).join(' '), true);

  return terminal;
}

export function startBackgroundProcess(plan: TerminalPlan): void {
  const env = Object.fromEntries(
    Object.entries({ ...process.env, ...plan.env })
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)])
  );

  if (process.platform === 'win32') {
    const comspec = env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
    const commandLine = [plan.command, ...plan.args].map(quoteShellArg).join(' ');

    const child = spawn(comspec, ['/d', '/s', '/c', commandLine], {
      cwd: plan.cwd,
      env,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    return;
  }

  const child = spawn(plan.command, plan.args, {
    cwd: plan.cwd,
    env,
    detached: true,
    stdio: 'ignore',
    shell: false,
  });
  child.unref();
}

export async function runPatchbayCommand(
  workspaceRoot: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  if (process.platform === 'win32') {
    const command = [getPatchbayCliExecutable(), ...args].map(quoteShellArg).join(' ');
    return execAsync(command, { cwd: workspaceRoot });
  }

  return execFileAsync(getPatchbayCliExecutable(), args, { cwd: workspaceRoot });
}

export function quoteShellArg(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '\\"')}"`;
}

export function getCommandErrorMessage(error: unknown): string {
  if (!error) {
    return 'Unknown error';
  }

  if (typeof error === 'string') {
    return error;
  }

  const commandError = error as CommandExecutionError;
  const stderr = commandError.stderr?.trim();
  const stdout = commandError.stdout?.trim();

  if (stderr) {
    return stderr;
  }

  if (stdout) {
    return stdout;
  }

  if (commandError.message) {
    return commandError.message;
  }

  return String(error);
}

export function schedulePostRunCheck(
  taskId: string,
  runnerId: string,
  workspaceRoot: string,
  ...delays: number[]
): void {
  let handled = false;

  const check = async (): Promise<void> => {
    if (handled) {
      return;
    }

    const agentsDirName = vscode.workspace
      .getConfiguration('wntrmte.workflow')
      .get<string>('projectAgentsDir', '.project-agents');
    const runsDir = path.join(workspaceRoot, agentsDirName, 'runs');

    let files: string[];
    try {
      files = await fs.readdir(runsDir);
    } catch {
      return;
    }

    let latestRun: Run | undefined;
    for (const file of files.filter((entry) => entry.endsWith('.json'))) {
      try {
        const content = await fs.readFile(path.join(runsDir, file), 'utf-8');
        const data = JSON.parse(content) as Partial<Run>;
        if (data.taskId !== taskId || data.runner !== runnerId) {
          continue;
        }

        if (!latestRun || (data.startTime ?? '') > (latestRun.startTime ?? '')) {
          latestRun = {
            id: data.id ?? path.basename(file, '.json'),
            taskId: data.taskId ?? taskId,
            runner: data.runner ?? runnerId,
            startTime: data.startTime ?? '',
            endTime: data.endTime,
            status: data.status ?? 'failed',
            summary: data.summary,
            installHint: data.installHint,
            conversationId: data.conversationId,
            sessionId: data.sessionId,
            turnIndex: data.turnIndex,
            filePath: path.join(runsDir, file),
          };
        }
      } catch {
        // Skip malformed run files.
      }
    }

    if (!latestRun) {
      return;
    }

    if (latestRun.installHint && latestRun.status === 'failed') {
      handled = true;
      const action = await vscode.window.showErrorMessage(
        `${runnerId} CLI is not installed. Install it now?`,
        'Install in Terminal'
      );
      if (action !== 'Install in Terminal') {
        return;
      }

      const installPlan: CliInstallPlan = {
        label: `Install ${runnerId}`,
        detail: latestRun.installHint,
        terminalName: `Install ${runnerId}`,
        terminalCwd: workspaceRoot,
        commands: [latestRun.installHint],
      };
      runTerminalPlan(installPlan);
      return;
    }

    if (latestRun.conversationId && latestRun.status === 'completed') {
      const tasksDir = path.join(workspaceRoot, agentsDirName, 'tasks');
      let taskStatus: string | undefined;
      try {
        const taskFiles = await fs.readdir(tasksDir);
        for (const file of taskFiles) {
          try {
            const raw = await fs.readFile(path.join(tasksDir, file), 'utf-8');
            const idMatch = raw.match(/^id:\s*(.+)$/m);
            const statusMatch = raw.match(/^status:\s*(.+)$/m);
            if (idMatch?.[1]?.trim() === taskId) {
              taskStatus = statusMatch?.[1]?.trim();
              break;
            }
          } catch {
            // Skip malformed task files.
          }
        }
      } catch {
        // Ignore missing task directory.
      }

      if (taskStatus !== 'awaiting_input') {
        return;
      }

      handled = true;
      const question = latestRun.summary ?? 'The runner is asking for more information.';
      const reply = await vscode.window.showInputBox({
        title: `Runner question for ${taskId}`,
        prompt: question,
        placeHolder: 'Type your reply, or press Escape to skip...',
        ignoreFocusOut: true,
      });

      if (!reply) {
        return;
      }

      const escapedReply = reply.replace(/"/g, '\\"');
      const replyCmd = `patchbay reply ${latestRun.conversationId} "${escapedReply}"`;
      runTerminalPlan({
        label: 'Reply to runner',
        detail: replyCmd,
        terminalName: 'Patchbay: Reply',
        terminalCwd: workspaceRoot,
        commands: [replyCmd],
      });

      schedulePostRunCheck(taskId, runnerId, workspaceRoot, 8000, 18000, 35000);
    }
  };

  for (const delay of delays) {
    setTimeout(() => {
      void check();
    }, delay);
  }
}
