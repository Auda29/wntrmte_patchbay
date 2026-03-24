import * as vscode from 'vscode';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import type { StoreMode } from '../store/StoreFactory';
import { AUTH_RUNNERS } from './constants';

const execAsync = promisify(exec);

export type EffectiveMode = 'offline' | 'connected';

export interface WorkspaceContext {
  hasWorkspace: boolean;
  workspaceRoot?: string;
  agentsDirName: string;
  workspaceReady: boolean;
}

export interface CliStatus {
  available: boolean;
  version?: string;
  error?: string;
}

export interface DashboardStatus {
  reachable: boolean;
  url: string;
  error?: string;
}

export interface AuthStatus {
  supported: string[];
  configured: string[];
  missing: string[];
  available: boolean;
  error?: string;
}

export interface SetupStatus {
  hasWorkspace: boolean;
  workspaceReady: boolean;
  workspaceComplete: boolean;
  workspaceRoot?: string;
  agentsDirName: string;
  configuredMode: StoreMode;
  effectiveMode: EffectiveMode;
  defaultRunner: string;
  cli: CliStatus;
  dashboard: DashboardStatus;
  auth: AuthStatus;
}

export class SetupInspector {
  constructor(private readonly context: WorkspaceContext) {}

  async inspect(): Promise<SetupStatus> {
    const config = vscode.workspace.getConfiguration('wntrmte.workflow');
    const configuredMode = config.get<StoreMode>('mode', 'auto');
    const defaultRunner = config.get<string>('defaultRunner', 'claude-code');
    const dashboardUrl = config.get<string>('dashboardUrl', 'http://localhost:3000');

    const [cli, dashboard, auth] = await Promise.all([
      checkPatchbayCli(this.context.workspaceRoot),
      probeDashboard(dashboardUrl),
      checkPatchbayAuth(this.context.workspaceRoot),
    ]);

    const workspaceComplete = this.context.workspaceReady
      && !!this.context.workspaceRoot
      && isWorkspaceComplete(this.context.workspaceRoot, this.context.agentsDirName);

    return {
      hasWorkspace: this.context.hasWorkspace,
      workspaceReady: this.context.workspaceReady,
      workspaceComplete,
      workspaceRoot: this.context.workspaceRoot,
      agentsDirName: this.context.agentsDirName,
      configuredMode,
      effectiveMode: resolveEffectiveMode(configuredMode, dashboard.reachable),
      defaultRunner,
      cli,
      dashboard,
      auth,
    };
  }
}

export function getWorkspaceContext(agentsDirName: string): WorkspaceContext {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  if (!workspaceRoot) {
    return {
      hasWorkspace: false,
      agentsDirName,
      workspaceReady: false,
    };
  }

  return {
    hasWorkspace: true,
    workspaceRoot,
    agentsDirName,
    workspaceReady: hasProjectAgentsDir(workspaceRoot, agentsDirName),
  };
}

export function hasProjectAgentsDir(workspaceRoot: string, agentsDirName: string): boolean {
  return fs.existsSync(path.join(workspaceRoot, agentsDirName));
}

export function isWorkspaceComplete(workspaceRoot: string, agentsDirName: string): boolean {
  const base = path.join(workspaceRoot, agentsDirName);
  return fs.existsSync(path.join(base, 'agents'))
    && fs.existsSync(path.join(base, 'decisions'))
    && fs.existsSync(path.join(base, 'context'));
}

export function getPatchbayCliExecutable(): string {
  return process.platform === 'win32' ? 'patchbay.cmd' : 'patchbay';
}

export async function checkPatchbayCli(cwd?: string): Promise<CliStatus> {
  try {
    const { stdout, stderr } = await execAsync('patchbay --version', cwd ? { cwd } : undefined);
    const version = String(stdout || stderr).trim();
    return {
      available: true,
      version: version || 'patchbay',
    };
  } catch (error) {
    return {
      available: false,
      error: getErrorMessage(error),
    };
  }
}

export async function checkPatchbayAuth(cwd?: string): Promise<AuthStatus> {
  const supported = [...AUTH_RUNNERS];

  try {
    const { stdout, stderr } = await execAsync('patchbay auth list', cwd ? { cwd } : undefined);
    const output = String(stdout || stderr);
    const configured = parseConfiguredAuthRunners(output, supported);

    return {
      supported,
      configured,
      missing: supported.filter((runner) => !configured.includes(runner)),
      available: true,
      error: output.includes('No runner auth configured')
        ? undefined
        : configured.length === 0 && output.trim().length > 0
          ? 'Unable to parse `patchbay auth list` output.'
          : undefined,
    };
  } catch (error) {
    return {
      supported,
      configured: [],
      missing: supported,
      available: false,
      error: getErrorMessage(error),
    };
  }
}

export async function probeDashboard(url: string): Promise<DashboardStatus> {
  let lastError = 'unreachable';

  for (const candidate of getDashboardProbeCandidates(url)) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(`${candidate}/api/state`, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        continue;
      }

      return {
        reachable: true,
        url: candidate,
      };
    } catch (error) {
      lastError = getErrorMessage(error);
    }
  }

  return {
    reachable: false,
    url,
    error: lastError,
  };
}

export interface InitViaCliOptions {
  name: string;
  goal: string;
  techStack: string;
}

export interface DetectedProjectInitMeta {
  name: string;
  goal: string;
  techStack: string[];
}

interface PackageMeta {
  name?: string;
  description?: string;
  deps: string[];
}

interface NamedDescriptionMeta {
  name?: string;
  description?: string;
}

export function detectProjectInitMeta(workspaceRoot: string): DetectedProjectInitMeta {
  const packageMeta = readPackageMeta(workspaceRoot);
  const pyprojectMeta = readPyprojectMeta(workspaceRoot);
  const cargoMeta = readCargoMeta(workspaceRoot);
  const goMeta = readGoMeta(workspaceRoot);

  const detectedName = packageMeta?.name
    || pyprojectMeta?.name
    || cargoMeta?.name
    || goMeta?.name
    || path.basename(workspaceRoot)
    || 'My Patchbay Project';
  const detectedGoal = packageMeta?.description
    || pyprojectMeta?.description
    || cargoMeta?.description
    || 'To build awesome software';

  const techStack: string[] = [];
  if (packageMeta) {
    techStack.push('Node.js');
    if (packageMeta.deps.includes('typescript') || fileExists(workspaceRoot, 'tsconfig.json')) {
      techStack.push('TypeScript');
    }
    if (packageMeta.deps.includes('next')) {
      techStack.push('Next.js');
    }
    if (packageMeta.deps.includes('react')) {
      techStack.push('React');
    }
    if (packageMeta.deps.includes('tailwindcss')) {
      techStack.push('Tailwind CSS');
    }
  }

  if (pyprojectMeta || fileExists(workspaceRoot, 'pytest.ini')) {
    techStack.push('Python');
  }
  if (cargoMeta) {
    techStack.push('Rust');
  }
  if (goMeta) {
    techStack.push('Go');
  }

  return {
    name: detectedName,
    goal: detectedGoal,
    techStack: unique(techStack),
  };
}

export async function initViaCli(
  workspaceRoot: string,
  opts: InitViaCliOptions,
): Promise<boolean> {
  return new Promise((resolve) => {
    const args = [
      'init',
      '--yes',
      '--name', opts.name,
      '--goal', opts.goal,
      '--tech-stack', opts.techStack,
    ];

    const proc = spawn('patchbay', args, {
      cwd: workspaceRoot,
      shell: true,
      stdio: 'pipe',
    });

    let stderr = '';
    proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        console.error(`patchbay init failed (exit ${code}): ${stderr.trim()}`);
        resolve(false);
      }
    });

    proc.on('error', (err) => {
      console.error('patchbay init spawn error:', err.message);
      resolve(false);
    });
  });
}

export async function createPatchbayWorkspace(workspaceRoot: string, agentsDirName: string): Promise<void> {
  const agentsDir = path.join(workspaceRoot, agentsDirName);
  const tasksDir = path.join(agentsDir, 'tasks');
  const runsDir = path.join(agentsDir, 'runs');
  const sessionsDir = path.join(agentsDir, 'sessions');
  const agentProfilesDir = path.join(agentsDir, 'agents');
  const decisionsDir = path.join(agentsDir, 'decisions');
  const contextDir = path.join(agentsDir, 'context');

  await fsPromises.mkdir(tasksDir, { recursive: true });
  await fsPromises.mkdir(runsDir, { recursive: true });
  await fsPromises.mkdir(sessionsDir, { recursive: true });
  await fsPromises.mkdir(agentProfilesDir, { recursive: true });
  await fsPromises.mkdir(decisionsDir, { recursive: true });
  await fsPromises.mkdir(contextDir, { recursive: true });

  const projectName = path.basename(workspaceRoot);
  const projectFile = path.join(agentsDir, 'project.yml');
  const taskFile = path.join(tasksDir, 'task-001.md');

  if (!fs.existsSync(projectFile)) {
    const project = [
      `name: ${projectName}`,
      `goal: Bootstrapped Patchbay workspace for ${projectName}`,
      `repoPath: ${workspaceRoot.replace(/\\/g, '/')}`,
      'rules: []',
      'techStack: []',
      '',
    ].join('\n');
    await fsPromises.writeFile(projectFile, project, 'utf-8');
  }

  if (!fs.existsSync(taskFile)) {
    const task = [
      '---',
      'id: task-001',
      'title: Verify Patchbay workspace setup',
      'status: open',
      'owner: wintermute',
      'affectedFiles: []',
      '---',
      '',
      'Confirm that Wintermute, Patchbay CLI, and the local dashboard are wired up for this workspace.',
      '',
      '- Start or connect the Patchbay dashboard.',
      '- Check the configured default runner.',
      '- Replace this bootstrap task with real project work.',
      '',
    ].join('\n');
    await fsPromises.writeFile(taskFile, task, 'utf-8');
  }
}

export function resolveEffectiveMode(mode: StoreMode, dashboardReachable: boolean): EffectiveMode {
  if (mode === 'offline') {
    return 'offline';
  }

  if (mode === 'connected') {
    return 'connected';
  }

  return dashboardReachable ? 'connected' : 'offline';
}

function parseConfiguredAuthRunners(output: string, supported: string[]): string[] {
  if (output.includes('No runner auth configured')) {
    return [];
  }

  const configured = new Set<string>();

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(\S+)\s+(subscription|apiKey)\b/);
    if (match && supported.includes(match[1])) {
      configured.add(match[1]);
    }
  }

  return [...configured];
}

function getDashboardProbeCandidates(url: string): string[] {
  const candidates = new Set<string>();
  candidates.add(trimTrailingSlash(url));

  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'localhost') {
      parsed.hostname = '127.0.0.1';
      candidates.add(trimTrailingSlash(parsed.toString()));
    } else if (parsed.hostname === '127.0.0.1') {
      parsed.hostname = 'localhost';
      candidates.add(trimTrailingSlash(parsed.toString()));
    }
  } catch {
    // Keep the original URL only if parsing fails.
  }

  return [...candidates];
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function fileExists(repoRoot: string, relativePath: string): boolean {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function readTextFile(repoRoot: string, relativePath: string): string | undefined {
  const fullPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    return undefined;
  }

  return fs.readFileSync(fullPath, 'utf8');
}

function readJsonFile<T>(repoRoot: string, relativePath: string): T | undefined {
  const text = readTextFile(repoRoot, relativePath);
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

function matchTomlString(content: string, key: string): string | undefined {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`^\\s*${escapedKey}\\s*=\\s*["']([^"']+)["']\\s*$`, 'm'));
  return match?.[1]?.trim();
}

function readPackageMeta(repoRoot: string): PackageMeta | undefined {
  const pkg = readJsonFile<{
    name?: string;
    description?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(repoRoot, 'package.json');

  if (!pkg) {
    return undefined;
  }

  return {
    name: pkg.name?.trim(),
    description: pkg.description?.trim(),
    deps: [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ],
  };
}

function readPyprojectMeta(repoRoot: string): NamedDescriptionMeta | undefined {
  const content = readTextFile(repoRoot, 'pyproject.toml');
  if (!content) {
    return undefined;
  }

  return {
    name: matchTomlString(content, 'name'),
    description: matchTomlString(content, 'description'),
  };
}

function readCargoMeta(repoRoot: string): NamedDescriptionMeta | undefined {
  const content = readTextFile(repoRoot, 'Cargo.toml');
  if (!content) {
    return undefined;
  }

  return {
    name: matchTomlString(content, 'name'),
    description: matchTomlString(content, 'description'),
  };
}

function readGoMeta(repoRoot: string): Pick<NamedDescriptionMeta, 'name'> | undefined {
  const content = readTextFile(repoRoot, 'go.mod');
  if (!content) {
    return undefined;
  }

  const match = content.match(/^\s*module\s+([^\s]+)\s*$/m);
  if (!match) {
    return undefined;
  }

  const modulePath = match[1].trim();
  return {
    name: modulePath.split('/').filter(Boolean).pop(),
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const causeMessage = typeof error.cause === 'object' && error.cause instanceof Error
    ? error.cause.message
    : undefined;

  return causeMessage ? `${error.message}: ${causeMessage}` : error.message;
}
