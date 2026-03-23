import * as vscode from 'vscode';
import * as fsSync from 'fs';
import * as path from 'path';
import { createStore } from './store/StoreFactory';
import { PatchbayStore } from './store/PatchbayStore';
import { TaskTreeProvider } from './providers/TaskTreeProvider';
import { RunLogProvider } from './providers/RunLogProvider';
import { WorkflowStatusBar } from './providers/StatusBarItem';
import { DashboardPanel } from './providers/DashboardPanel';
import type { TaskStatus } from '@patchbay/core';
import type { Run } from './store/types';
import { AVAILABLE_RUNNERS } from './services/constants';
import {
  SetupInspector,
  checkPatchbayCli,
  SetupStatus,
  getWorkspaceContext,
  createPatchbayWorkspace,
  initViaCli,
  getPatchbayCliExecutable,
  WorkspaceContext,
  detectProjectInitMeta,
} from './services/SetupInspector';
import {
  CliInstallPlan,
  runTerminalPlan,
  runTerminalPlanInBackground,
  schedulePostRunCheck,
} from './services/TerminalOrchestrator';
import {
  createCloneInstallPlan,
  createLocalInstallPlan,
  getDashboardStartPlan,
  getPatchbayCliInstallOptions,
  getPatchbayCliMissingMessage,
  getSuggestedPatchbayCloneDir,
  getSuggestedPatchbayRepoDir,
  hasPatchbayCliPackage,
} from './services/CliManager';
import { configureRunnerAuth, openRunnerAuthTerminal } from './services/AuthService';

const ALL_STATUSES: TaskStatus[] = ['open', 'in_progress', 'blocked', 'review', 'done'];
const PANEL_AUTO_REFRESH_MS = 3000;

export function activate(ctx: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('Patchbay');
  const dashboardPanel = new DashboardPanel();
  const dashboardToggle = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  const terminalToggle = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  dashboardToggle.name = 'Patchbay Dashboard Toggle';
  dashboardToggle.command = 'wntrmte.toggleDashboard';
  dashboardToggle.text = '$(layout-sidebar-right) Patchbay';
  dashboardToggle.tooltip = 'Toggle the Patchbay start panel';
  dashboardToggle.show();
  terminalToggle.name = 'Terminal Toggle';
  terminalToggle.command = 'wntrmte.toggleTerminalPanel';
  terminalToggle.text = '$(terminal) Terminal';
  terminalToggle.tooltip = 'Toggle the integrated terminal';
  terminalToggle.show();

  let store: PatchbayStore | undefined;
  let treeProvider: TaskTreeProvider | undefined;
  let bootstrapDisposables: vscode.Disposable[] = [];
  let latestSetupStatus: SetupStatus | undefined;
  let panelRefreshInFlight: Promise<SetupStatus> | undefined;

  const getAgentsDirName = (): string => vscode.workspace
    .getConfiguration('wntrmte.workflow')
    .get<string>('projectAgentsDir', '.project-agents');

  const getContext = (): WorkspaceContext => getWorkspaceContext(getAgentsDirName());

  const updateContexts = (context: WorkspaceContext, connected: boolean): void => {
    void vscode.commands.executeCommand('setContext', 'wntrmte.workspaceOpen', context.hasWorkspace);
    void vscode.commands.executeCommand('setContext', 'wntrmte.projectAgentsFound', context.workspaceReady);
    void vscode.commands.executeCommand('setContext', 'wntrmte.connected', connected);
  };

  const disposeBootstrap = (): void => {
    for (const disposable of bootstrapDisposables) {
      disposable.dispose();
    }
    bootstrapDisposables = [];
    store = undefined;
    treeProvider = undefined;
  };

  const refreshPanel = async (show = false): Promise<SetupStatus> => {
    if (panelRefreshInFlight) {
      return panelRefreshInFlight;
    }

    panelRefreshInFlight = (async () => {
      const inspector = new SetupInspector(getContext());
      const status = await inspector.inspect();
      latestSetupStatus = status;
      updateContexts(
        getContext(),
        status.hasWorkspace && status.workspaceReady && status.effectiveMode === 'connected'
      );

      if (show) {
        await dashboardPanel.show(status, vscode.ViewColumn.Beside);
      } else {
        dashboardPanel.update(status);
      }

      return status;
    })();

    try {
      return await panelRefreshInFlight;
    } finally {
      panelRefreshInFlight = undefined;
    }
  };

  const schedulePanelRefresh = (): void => {
    if (!dashboardPanel.isOpen()) {
      return;
    }

    void refreshPanel(false);
  };

  const scheduleDelayedPanelRefresh = (...delays: number[]): void => {
    for (const delay of delays) {
      const handle = setTimeout(() => {
        schedulePanelRefresh();
      }, delay);
      ctx.subscriptions.push({ dispose: () => clearTimeout(handle) });
    }
  };

  const scheduleDelayedStoreInitialize = (...delays: number[]): void => {
    for (const delay of delays) {
      const handle = setTimeout(() => {
        void initializeStore();
      }, delay);
      ctx.subscriptions.push({ dispose: () => clearTimeout(handle) });
    }
  };

  const initializeStore = async (): Promise<void> => {
    disposeBootstrap();

    const context = getContext();
    updateContexts(context, false);

    if (!context.workspaceReady || !context.workspaceRoot) {
      await refreshPanel(dashboardPanel.isOpen());
      return;
    }

    const storeResult = await createStore(context.workspaceRoot, context.agentsDirName);
    store = storeResult.store;
    treeProvider = new TaskTreeProvider(store);
    const statusBar = new WorkflowStatusBar(store);

    bootstrapDisposables = [
      store,
      statusBar,
      vscode.window.registerTreeDataProvider('wntrmte.taskTree', treeProvider),
      vscode.workspace.registerTextDocumentContentProvider(
        RunLogProvider.scheme,
        new RunLogProvider()
      ),
      store.onDidChange(() => {
        schedulePanelRefresh();
      }),
    ];

    updateContexts(context, storeResult.mode === 'connected');
    await refreshPanel(dashboardPanel.isOpen());
  };

  const ensureWorkspaceRoot = async (): Promise<string | undefined> => {
    const context = getContext();
    if (context.workspaceRoot) {
      return context.workspaceRoot;
    }

    const action = await vscode.window.showInformationMessage(
      'Open a project folder to initialize a Patchbay workspace.',
      'Open Folder'
    );

    if (action === 'Open Folder') {
      await vscode.commands.executeCommand('vscode.openFolder');
    }

    return undefined;
  };

  const ensureStore = (): PatchbayStore | undefined => {
    if (!store) {
      void vscode.window.showWarningMessage(
        'Patchbay is not ready yet. Open or initialize a Patchbay workspace first.'
      );
      return undefined;
    }

    return store;
  };

  const getSetupStatus = async (): Promise<SetupStatus> => latestSetupStatus ?? refreshPanel(false);

  const promptCliInstall = async (): Promise<void> => {
    await vscode.commands.executeCommand('wntrmte.showPatchbayCliInstall');
  };

  ctx.subscriptions.push(
    outputChannel,
    dashboardPanel,
    dashboardToggle,
    terminalToggle,
    { dispose: disposeBootstrap },
    {
      dispose: (() => {
        const timer = setInterval(() => {
          schedulePanelRefresh();
        }, PANEL_AUTO_REFRESH_MS);

        return () => clearInterval(timer);
      })(),
    },
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      await initializeStore();
    }),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (
        event.affectsConfiguration('wntrmte.workflow.mode') ||
        event.affectsConfiguration('wntrmte.workflow.projectAgentsDir')
      ) {
        await initializeStore();
        return;
      }

      if (
        event.affectsConfiguration('wntrmte.workflow.dashboardUrl') ||
        event.affectsConfiguration('wntrmte.workflow.defaultRunner')
      ) {
        await refreshPanel(dashboardPanel.isOpen());
      }
    }),
    vscode.commands.registerCommand('wntrmte.refresh', async () => {
      treeProvider?.refresh();
      await refreshPanel(dashboardPanel.isOpen());
    }),
    vscode.commands.registerCommand('wntrmte.setStatus', async (item: unknown) => {
      const activeStore = ensureStore();
      const task = (item as { task?: { id: string; status: TaskStatus } })?.task;
      if (!activeStore || !task) {
        return;
      }

      const pick = await vscode.window.showQuickPick(
        ALL_STATUSES.map((status) => ({
          label: status,
          description: status === task.status ? '(current)' : undefined,
        })),
        { title: `Set status for ${task.id}` }
      );
      if (!pick) {
        return;
      }

      try {
        await activeStore.updateTaskStatus(task.id, pick.label as TaskStatus);
      } catch (error) {
        void vscode.window.showErrorMessage(`Failed to update task: ${String(error)}`);
      }
    }),
    vscode.commands.registerCommand('wntrmte.openRun', async (run: Run) => {
      await RunLogProvider.open(run);
    }),
    vscode.commands.registerCommand('wntrmte.openDashboard', () => {
      void refreshPanel(true);
    }),
    vscode.commands.registerCommand('wntrmte.toggleDashboard', async () => {
      const setupStatus = await getSetupStatus();
      await dashboardPanel.toggle(setupStatus, vscode.ViewColumn.Beside);
    }),
    vscode.commands.registerCommand('wntrmte.toggleTerminalPanel', async () => {
      await vscode.commands.executeCommand('workbench.action.togglePanel');
    }),
    vscode.commands.registerCommand('wntrmte.refreshDashboardPanel', async () => {
      await refreshPanel(dashboardPanel.isOpen());
    }),
    vscode.commands.registerCommand('wntrmte.openPatchbayDashboardExternal', async () => {
      const setupStatus = await getSetupStatus();
      if (!setupStatus.dashboard.reachable) {
        const startPlan = getDashboardStartPlan(
          setupStatus.workspaceRoot,
          setupStatus.dashboard.url,
          ctx.extensionUri.fsPath,
        );
        const dashboardActions = startPlan ? ['Start Dashboard', 'Open Anyway'] : ['Open Anyway'];
        const action = await vscode.window.showWarningMessage(
          `Patchbay dashboard is not reachable at ${setupStatus.dashboard.url}.`,
          ...dashboardActions
        );

        if (action === 'Start Dashboard' && startPlan) {
          runTerminalPlanInBackground(startPlan);
          scheduleDelayedPanelRefresh(1500, 4000, 8000);
          void vscode.window.showInformationMessage(
            `${startPlan.label} started in the background. Wintermute will update automatically.`
          );
          return;
        }

        if (action !== 'Open Anyway') {
          return;
        }
      }

      await vscode.env.openExternal(vscode.Uri.parse(setupStatus.dashboard.url));
    }),
    vscode.commands.registerCommand('wntrmte.startPatchbayDashboard', async () => {
      const setupStatus = await getSetupStatus();
      const startPlan = getDashboardStartPlan(
        setupStatus.workspaceRoot,
        setupStatus.dashboard.url,
        ctx.extensionUri.fsPath,
      );

      if (!startPlan) {
        void vscode.window.showWarningMessage(
          'Wintermute could not determine how to start Patchbay automatically for the current dashboard URL.'
        );
        return;
      }

      try {
        runTerminalPlanInBackground(startPlan);
        scheduleDelayedPanelRefresh(1500, 4000, 8000);
        void vscode.window.showInformationMessage(
          `${startPlan.label} started in the background. Wintermute will update automatically.`
        );
      } catch (error) {
        void vscode.window.showErrorMessage(`Failed to start Patchbay dashboard: ${String(error)}`);
      }
    }),
    vscode.commands.registerCommand('wntrmte.checkPatchbayCli', async () => {
      const context = getContext();
      const cli = await checkPatchbayCli(context.workspaceRoot);
      await refreshPanel(dashboardPanel.isOpen());

      if (cli.available) {
        void vscode.window.showInformationMessage(`Patchbay CLI available: ${cli.version ?? 'patchbay'}`);
        return;
      }

      void vscode.window.showWarningMessage(`Patchbay CLI not available: ${cli.error ?? 'unknown error'}`);
    }),
    vscode.commands.registerCommand('wntrmte.showPatchbayCliInstall', async () => {
      const context = getContext();
      const installOptions = getPatchbayCliInstallOptions(context.workspaceRoot, ctx.extensionUri.fsPath);
      const selection = await vscode.window.showQuickPick(installOptions, {
        title: 'Install Patchbay CLI',
        placeHolder: 'Choose how Wintermute should prepare the Patchbay CLI',
      });

      if (!selection) {
        return;
      }

      if (selection.kind === 'manual') {
        await vscode.env.openExternal(vscode.Uri.parse('https://github.com/Auda29/patchbay'));
        return;
      }

      if (selection.kind === 'npm') {
        const npmExe = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        const npmPlan: CliInstallPlan = {
          label: 'Install Patchbay CLI via npm',
          detail: 'npm install -g @patchbay/cli',
          terminalName: 'Patchbay CLI Install',
          commands: [`${npmExe} install -g @patchbay/cli`],
        };
        const action = await vscode.window.showInformationMessage(
          'Install @patchbay/cli globally via npm? This requires the package to be published to the npm registry.',
          { modal: true },
          'Run in Terminal'
        );
        if (action === 'Run in Terminal') {
          runTerminalPlan(npmPlan);
          scheduleDelayedPanelRefresh(5000, 15000, 30000);
        }
        return;
      }

      let installPlan = selection.plan;

      if (selection.kind === 'local') {
        const suggestedRepo = getSuggestedPatchbayRepoDir(context.workspaceRoot, ctx.extensionUri.fsPath);
        const pickedRepo = await vscode.window.showOpenDialog({
          title: 'Select local Patchbay repository',
          defaultUri: vscode.Uri.file(suggestedRepo),
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: 'Use this folder',
        });
        const localRepo = pickedRepo?.[0]?.fsPath;
        if (!localRepo) {
          return;
        }

        if (!hasPatchbayCliPackage(localRepo)) {
          void vscode.window.showWarningMessage(`The selected folder is not a Patchbay repo: ${localRepo}`);
          return;
        }

        installPlan = createLocalInstallPlan(localRepo);
      }

      if (selection.kind === 'clone') {
        const destinationDir = await vscode.window.showInputBox({
          title: 'Clone Patchbay repository',
          prompt: 'Directory where Wintermute should clone Patchbay before installing the CLI',
          value: getSuggestedPatchbayCloneDir(context.workspaceRoot),
          ignoreFocusOut: true,
        });
        if (!destinationDir) {
          return;
        }

        if (fsSync.existsSync(destinationDir)) {
          void vscode.window.showWarningMessage(`The destination already exists: ${destinationDir}`);
          return;
        }

        installPlan = createCloneInstallPlan(destinationDir);
      }

      if (!installPlan) {
        void vscode.window.showWarningMessage('Wintermute could not determine a Patchbay CLI install plan.');
        return;
      }

      const action = await vscode.window.showInformationMessage(
        `${installPlan.label}? Wintermute will run the required steps in the integrated terminal.`,
        { modal: true },
        'Run in Terminal'
      );

      if (action === 'Run in Terminal') {
        runTerminalPlan(installPlan);
      }
    }),
    vscode.commands.registerCommand('wntrmte.showOutput', () => {
      outputChannel.show(true);
    }),
    vscode.commands.registerCommand('wntrmte.setDefaultRunner', async () => {
      const defaultRunner = vscode.workspace
        .getConfiguration('wntrmte.workflow')
        .get<string>('defaultRunner', 'claude-code');

      const pick = await vscode.window.showQuickPick(
        AVAILABLE_RUNNERS.map((runner) => ({
          ...runner,
          description: runner.label === defaultRunner
            ? `${runner.description} (current)`
            : runner.description,
        })),
        { title: 'Select default runner' }
      );
      if (!pick) {
        return;
      }

      await vscode.workspace
        .getConfiguration('wntrmte.workflow')
        .update('defaultRunner', pick.label, vscode.ConfigurationTarget.Workspace);
    }),
    vscode.commands.registerCommand('wntrmte.configureAuth', async () => {
      const setupStatus = await getSetupStatus();
      await configureRunnerAuth(
        setupStatus,
        async () => {
          await refreshPanel(dashboardPanel.isOpen());
        },
        promptCliInstall,
      );
    }),
    vscode.commands.registerCommand('wntrmte.configureClaude', async () => {
      await openRunnerAuthTerminal('claude-code', await getSetupStatus(), promptCliInstall);
    }),
    vscode.commands.registerCommand('wntrmte.configureCodex', async () => {
      await openRunnerAuthTerminal('codex', await getSetupStatus(), promptCliInstall);
    }),
    vscode.commands.registerCommand('wntrmte.configureGemini', async () => {
      await openRunnerAuthTerminal('gemini', await getSetupStatus(), promptCliInstall);
    }),
    vscode.commands.registerCommand('wntrmte.setupWorkspace', async () => {
      const workspaceRoot = await ensureWorkspaceRoot();
      if (!workspaceRoot) {
        return;
      }

      const agentsDirName = getAgentsDirName();
      const projectName = path.basename(workspaceRoot);

      try {
        const cli = await checkPatchbayCli(workspaceRoot);
        let usedCli = false;

        if (cli.available) {
          const name = await vscode.window.showInputBox({
            title: 'Project Name',
            value: projectName,
            prompt: 'Name for the Patchbay project',
          });
          if (!name) {
            return;
          }

          const goal = await vscode.window.showInputBox({
            title: 'Project Goal',
            value: 'To build awesome software',
            prompt: 'Main goal of this project',
          });
          if (!goal) {
            return;
          }

          const techStack = await vscode.window.showInputBox({
            title: 'Tech Stack',
            value: 'Node.js, TypeScript',
            prompt: 'Tech stack (comma separated)',
          });
          if (!techStack) {
            return;
          }

          usedCli = await initViaCli(workspaceRoot, { name, goal, techStack });
        }

        if (!usedCli) {
          await createPatchbayWorkspace(workspaceRoot, agentsDirName);
          if (cli.available) {
            void vscode.window.showWarningMessage('CLI init failed - created minimal bootstrap instead.');
          } else {
            void vscode.window.showInformationMessage(
              'Created local bootstrap. Install Patchbay CLI for a full setup with schema validation.',
              'Install CLI'
            ).then((action) => {
              if (action === 'Install CLI') {
                void promptCliInstall();
              }
            });
          }
        }

        const projectFile = path.join(workspaceRoot, agentsDirName, 'project.yml');
        const initialTask = path.join(workspaceRoot, agentsDirName, 'tasks', 'task-001.md');
        await initializeStore();

        const action = await vscode.window.showInformationMessage(
          `Initialized Patchbay workspace in ${projectName}.`,
          'Open Project File',
          'Open Initial Task'
        );

        if (action === 'Open Project File') {
          const document = await vscode.workspace.openTextDocument(projectFile);
          await vscode.window.showTextDocument(document);
        } else if (action === 'Open Initial Task') {
          try {
            const document = await vscode.workspace.openTextDocument(initialTask);
            await vscode.window.showTextDocument(document);
          } catch {
            // CLI init does not create a bootstrap task - that is fine.
          }
        }
      } catch (error) {
        void vscode.window.showErrorMessage(`Failed to initialize Patchbay workspace: ${String(error)}`);
      }
    }),
    vscode.commands.registerCommand('wntrmte.initializePatchbay', async () => {
      const workspaceRoot = await ensureWorkspaceRoot();
      if (!workspaceRoot) {
        return;
      }

      const context = getContext();
      if (context.workspaceReady) {
        void vscode.window.showInformationMessage(
          'This workspace already contains .project-agents. Use "Initialize Patchbay Workspace" only for existing repos that are not initialized yet.'
        );
        return;
      }

      const cli = await checkPatchbayCli(workspaceRoot);
      if (!cli.available) {
        const action = await vscode.window.showWarningMessage(
          'Patchbay CLI is required to import an existing repository into Patchbay.',
          'Install CLI'
        );
        if (action === 'Install CLI') {
          await promptCliInstall();
        }
        return;
      }

      const detected = detectProjectInitMeta(workspaceRoot);
      const args = ['init', '--yes'];
      if (detected.name.trim()) {
        args.push('--name', detected.name);
      }
      if (detected.goal.trim()) {
        args.push('--goal', detected.goal);
      }
      if (detected.techStack.length > 0) {
        args.push('--tech-stack', detected.techStack.join(', '));
      }

      runTerminalPlan({
        label: 'Initialize Patchbay Workflow',
        detail: 'Auto-detect project metadata and initialize .project-agents',
        cwd: workspaceRoot,
        command: getPatchbayCliExecutable(),
        args,
      });
      scheduleDelayedStoreInitialize(1500, 4000, 8000);
      scheduleDelayedPanelRefresh(1500, 4000, 8000);

      void vscode.window.showInformationMessage(
        `Started Patchbay initialization for ${detected.name} in the integrated terminal.`
      );
    }),
    vscode.commands.registerCommand('wntrmte.dispatchInTerminal', (taskId: string, runnerId: string) => {
      const context = getContext();
      if (!context.workspaceRoot) {
        void vscode.window.showWarningMessage('No workspace open - cannot dispatch.');
        return;
      }

      const plan: CliInstallPlan = {
        label: `Dispatch ${taskId}`,
        detail: `${getPatchbayCliExecutable()} run ${taskId} ${runnerId}`,
        terminalName: `Patchbay: ${taskId}`,
        terminalCwd: context.workspaceRoot,
        commands: [`${getPatchbayCliExecutable()} run ${taskId} ${runnerId}`],
      };

      runTerminalPlan(plan);
      treeProvider?.refresh();
      scheduleDelayedPanelRefresh(3000, 8000, 20000);
      schedulePostRunCheck(taskId, runnerId, context.workspaceRoot, 5000, 12000, 25000, 60000);
    }),
    vscode.commands.registerCommand('wntrmte.runInTerminal', (command: string) => {
      const context = getContext();
      runTerminalPlan({
        label: 'Install runner',
        detail: command,
        terminalName: 'Patchbay: Install',
        terminalCwd: context.workspaceRoot ?? process.cwd(),
        commands: [command],
      });
    }),
    vscode.commands.registerCommand('wntrmte.dispatch', async () => {
      const activeStore = ensureStore();
      if (!activeStore) {
        return;
      }

      const context = getContext();
      const cli = await checkPatchbayCli(context.workspaceRoot);
      if (!cli.available) {
        void vscode.window.showErrorMessage(getPatchbayCliMissingMessage());
        return;
      }

      const tasks = await activeStore.getTasks();
      const actionable = tasks.filter((task) => task.status === 'open' || task.status === 'blocked');
      if (actionable.length === 0) {
        void vscode.window.showInformationMessage('No open tasks to dispatch.');
        return;
      }

      const taskPick = await vscode.window.showQuickPick(
        actionable.map((task) => ({ label: task.id, description: task.title, task })),
        { title: 'Select task to dispatch' }
      );
      if (!taskPick) {
        return;
      }

      const defaultRunner = vscode.workspace
        .getConfiguration('wntrmte.workflow')
        .get<string>('defaultRunner', 'claude-code');

      const sorted = [
        ...AVAILABLE_RUNNERS.filter((runner) => runner.label === defaultRunner),
        ...AVAILABLE_RUNNERS.filter((runner) => runner.label !== defaultRunner),
      ];

      const runnerPick = await vscode.window.showQuickPick(sorted, { title: 'Select runner' });
      if (!runnerPick || !context.workspaceRoot) {
        return;
      }

      await vscode.commands.executeCommand('wntrmte.dispatchInTerminal', taskPick.label, runnerPick.label);
    }),
    vscode.commands.registerCommand('wntrmte.switchMode', async () => {
      const pick = await vscode.window.showQuickPick(
        ['auto', 'offline', 'connected'],
        { title: 'Select connection mode' }
      );
      if (!pick) {
        return;
      }

      await vscode.workspace
        .getConfiguration('wntrmte.workflow')
        .update('mode', pick, vscode.ConfigurationTarget.Workspace);

      void vscode.window.showInformationMessage(`Mode set to "${pick}".`);
    }),
  );

  void (async () => {
    try {
      await initializeStore();

      const openOnStartup = vscode.workspace
        .getConfiguration('wntrmte.workflow')
        .get<boolean>('openDashboardOnStartup', true);

      if (openOnStartup) {
        await refreshPanel(true);
      }
    } catch (error) {
      void vscode.window.showErrorMessage(`Failed to initialize Wintermute Workflow: ${String(error)}`);
    }
  })();
}

export function deactivate(): void {
  // Store.dispose() is handled via ctx.subscriptions
}
