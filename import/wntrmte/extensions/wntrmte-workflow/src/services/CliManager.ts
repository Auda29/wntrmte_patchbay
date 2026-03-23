import * as vscode from 'vscode';
import * as fsSync from 'fs';
import * as path from 'path';
import { getPatchbayCliExecutable } from './SetupInspector';
import { CliInstallPlan, TerminalPlan } from './TerminalOrchestrator';

const PATCHBAY_REPO_URL = 'https://github.com/Auda29/patchbay.git';

export interface CliInstallOption {
  label: string;
  description: string;
  detail: string;
  plan?: CliInstallPlan;
  kind: 'npm' | 'local' | 'clone' | 'manual';
}

export function getPatchbayCliMissingMessage(): string {
  return 'Patchbay CLI not found. Use the CLI Install action to build and install it from a local Patchbay checkout.';
}

export function hasPatchbayCliPackage(repoRoot: string): boolean {
  return fsSync.existsSync(path.join(repoRoot, 'packages', 'cli', 'package.json'));
}

function collectPatchbayRepoCandidates(workspaceRoot: string | undefined, extensionRoot: string): string[] {
  const bases = new Set<string>();
  if (workspaceRoot) {
    bases.add(workspaceRoot);
    bases.add(path.dirname(workspaceRoot));
    bases.add(path.resolve(workspaceRoot, '..', 'wntrmte_patchbay'));
  }

  let current = extensionRoot;
  for (let index = 0; index < 8; index += 1) {
    bases.add(current);
    current = path.dirname(current);
  }

  const candidates = new Set<string>();
  for (const base of bases) {
    candidates.add(base);
    candidates.add(path.join(base, 'patchbay'));
    candidates.add(path.join(base, 'wntrmte_patchbay', 'patchbay'));
  }

  return [...candidates];
}

export function findLocalPatchbayRepo(
  workspaceRoot: string | undefined,
  extensionRoot: string,
): string | undefined {
  for (const candidate of collectPatchbayRepoCandidates(workspaceRoot, extensionRoot)) {
    if (hasPatchbayCliPackage(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export function createLocalInstallPlan(localRepo: string): CliInstallPlan {
  return {
    label: 'Install from local Patchbay repo',
    detail: localRepo,
    terminalName: 'Patchbay CLI Install',
    terminalCwd: localRepo,
    commands: [
      'npm install',
      'npm run build',
      'npm link --workspace=@patchbay/cli',
    ],
  };
}

export function getSuggestedPatchbayCloneDir(workspaceRoot: string | undefined): string {
  if (workspaceRoot) {
    return path.join(path.dirname(workspaceRoot), 'patchbay');
  }

  return path.join(path.dirname(vscode.env.appRoot), 'patchbay');
}

export function getSuggestedPatchbayRepoDir(
  workspaceRoot: string | undefined,
  extensionRoot: string,
): string {
  return findLocalPatchbayRepo(workspaceRoot, extensionRoot)
    ?? getSuggestedPatchbayCloneDir(workspaceRoot);
}

export function getPatchbayCliInstallOptions(
  workspaceRoot: string | undefined,
  extensionRoot: string,
): CliInstallOption[] {
  const detectedRepo = findLocalPatchbayRepo(workspaceRoot, extensionRoot);

  return [
    {
      label: '$(package) Install via npm',
      description: 'npm install -g @patchbay/cli',
      detail: 'Fastest path - requires @patchbay/cli to be published to the npm registry',
      kind: 'npm',
    },
    {
      label: 'Use existing checkout',
      description: 'Choose a local Patchbay repo and install the CLI from it',
      detail: detectedRepo ?? 'Select the local Patchbay folder',
      kind: 'local',
    },
    {
      label: 'Clone Patchbay nearby',
      description: 'Clone the official Patchbay repo and install the CLI',
      detail: PATCHBAY_REPO_URL,
      kind: 'clone',
    },
    {
      label: 'Show manual steps',
      description: 'Open the setup instructions instead of running commands',
      detail: 'Recommended if you want to review the install flow first',
      kind: 'manual',
    },
  ];
}

export function createCloneInstallPlan(destinationDir: string): CliInstallPlan {
  const repoRoot = path.resolve(destinationDir);
  const parentDir = path.dirname(repoRoot);
  const repoName = path.basename(repoRoot);

  return {
    label: 'Clone and install Patchbay CLI',
    detail: repoRoot,
    terminalName: 'Patchbay CLI Install',
    terminalCwd: parentDir,
    commands: [
      `git clone "${PATCHBAY_REPO_URL}" "${repoName}"`,
      `cd "${repoRoot}"`,
      'npm install',
      'npm run build',
      'npm link --workspace=@patchbay/cli',
    ],
  };
}

export function getDashboardStartPlan(
  workspaceRoot: string | undefined,
  dashboardUrl: string,
  extensionRoot: string,
): TerminalPlan | undefined {
  if (!workspaceRoot) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(dashboardUrl);
  } catch {
    return undefined;
  }

  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
  if (port === '3001') {
    return {
      label: 'Start Patchbay server',
      detail: `${parsed.origin} via patchbay serve`,
      cwd: workspaceRoot,
      command: getPatchbayCliExecutable(),
      args: ['serve', '--host', parsed.hostname, '--port', port, '--repo-root', workspaceRoot],
    };
  }

  const localRepo = findLocalPatchbayRepo(workspaceRoot, extensionRoot);
  if (!localRepo) {
    return undefined;
  }

  return {
    label: 'Start Patchbay dashboard',
    detail: `${parsed.origin} via Next.js dev server`,
    cwd: path.join(localRepo, 'packages', 'dashboard'),
    env: {
      PATCHBAY_REPO_ROOT: workspaceRoot,
    },
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', 'dev'],
  };
}
