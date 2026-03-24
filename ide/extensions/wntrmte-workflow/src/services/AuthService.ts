import * as vscode from 'vscode';
import { AVAILABLE_RUNNERS } from './constants';
import { SetupStatus, getPatchbayCliExecutable } from './SetupInspector';
import {
  getCommandErrorMessage,
  quoteShellArg,
  runPatchbayCommand,
} from './TerminalOrchestrator';

export function getRunnerDescription(runnerId: string): string {
  return AVAILABLE_RUNNERS.find((entry) => entry.label === runnerId)?.description ?? runnerId;
}

export async function openClaudeCodeCliTerminal(
  setupStatus: SetupStatus,
  promptInstallCli: () => Promise<void>,
): Promise<void> {
  const terminal = vscode.window.createTerminal({
    name: 'Claude Code CLI',
    cwd: setupStatus.workspaceRoot,
  });
  terminal.show(true);

  const action = await vscode.window.showInformationMessage(
    'Claude Code auth must happen in the official Claude Code CLI. Use the opened terminal to run `claude` and complete login there.',
    'Install Claude Code CLI'
  );

  if (action === 'Install Claude Code CLI') {
    await promptInstallCli();
  }
}

export async function openRunnerAuthTerminal(
  runnerId: string,
  setupStatus: SetupStatus,
  promptInstallCli: () => Promise<void>,
): Promise<void> {
  if (!setupStatus.cli.available) {
    const action = await vscode.window.showWarningMessage(
      'Patchbay CLI is required to configure runner auth.',
      'Install CLI'
    );
    if (action === 'Install CLI') {
      await promptInstallCli();
    }
    return;
  }

  const terminal = vscode.window.createTerminal({
    name: `Patchbay Auth: ${runnerId}`,
    cwd: setupStatus.workspaceRoot,
  });
  terminal.show(true);
  terminal.sendText(
    [getPatchbayCliExecutable(), 'auth', 'set', runnerId].map(quoteShellArg).join(' '),
    true
  );

  void vscode.window.showInformationMessage(
    `Opened the integrated terminal to configure ${getRunnerDescription(runnerId)} auth.`
  );
}

export async function configureRunnerAuth(
  setupStatus: SetupStatus,
  refreshPanel: () => Promise<void>,
  promptInstallCli: () => Promise<void>,
): Promise<void> {
  if (!setupStatus.cli.available || !setupStatus.auth.available) {
    const action = await vscode.window.showWarningMessage(
      'Patchbay CLI is required to configure runner auth.',
      'Install CLI'
    );
    if (action === 'Install CLI') {
      await promptInstallCli();
    }
    return;
  }

  if (setupStatus.auth.missing.length === 0) {
    void vscode.window.showInformationMessage('All Patchbay runner auth entries are already configured.');
    return;
  }

  const runnerPick = await vscode.window.showQuickPick(
    setupStatus.auth.missing.map((runner) => ({
      label: runner,
      description: getRunnerDescription(runner),
    })),
    { title: 'Configure auth for runner' }
  );
  if (!runnerPick) {
    return;
  }

  const authMode = await vscode.window.showQuickPick(
    [
      {
        label: 'Subscription',
        description: 'Use existing CLI login / subscription mode',
        args: ['auth', 'set', runnerPick.label, '--subscription'],
      },
      {
        label: 'API Key',
        description: 'Store an API key for this runner',
        args: ['auth', 'set', runnerPick.label, '--api-key'],
      },
    ],
    { title: `Select auth mode for ${runnerPick.label}` }
  );
  if (!authMode || !setupStatus.workspaceRoot) {
    return;
  }

  try {
    if (authMode.label === 'Subscription') {
      await runPatchbayCommand(setupStatus.workspaceRoot, authMode.args);
    } else {
      const apiKey = await vscode.window.showInputBox({
        title: `API key for ${runnerPick.label}`,
        prompt: 'Enter the API key that Patchbay should store for this runner',
        password: true,
        ignoreFocusOut: true,
      });
      if (!apiKey) {
        return;
      }

      await runPatchbayCommand(setupStatus.workspaceRoot, [...authMode.args, apiKey]);
    }

    await refreshPanel();
    void vscode.window.showInformationMessage(
      `Configured ${authMode.label.toLowerCase()} auth for ${runnerPick.label}.`
    );
  } catch (error) {
    void vscode.window.showErrorMessage(
      `Failed to configure auth for ${runnerPick.label}: ${getCommandErrorMessage(error)}`
    );
  }
}
