import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { PatchbayStore } from './PatchbayStore';
import type { Project, TaskStatus } from '@patchbay/core';
import { Task, Run } from './types';

/** Parses YAML frontmatter from Markdown files (--- ... --- format). */
function parseFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: content };
  }
  try {
    const data = (yaml.load(match[1]) ?? {}) as Record<string, unknown>;
    return { data, body: match[2] };
  } catch {
    return { data: {}, body: content };
  }
}

export class FileStore implements PatchbayStore {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private readonly _watcher: vscode.FileSystemWatcher;
  private readonly _agentsDir: string;

  constructor(workspaceRoot: string, agentsDirName = '.project-agents') {
    this._agentsDir = path.join(workspaceRoot, agentsDirName);

    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(this._agentsDir),
      '**/*'
    );
    this._watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this._watcher.onDidCreate(() => this._onDidChange.fire());
    this._watcher.onDidChange(() => this._onDidChange.fire());
    this._watcher.onDidDelete(() => this._onDidChange.fire());
  }

  async getTasks(): Promise<Task[]> {
    const tasksDir = path.join(this._agentsDir, 'tasks');
    let files: string[];
    try {
      files = await fs.readdir(tasksDir);
    } catch {
      return [];
    }

    const tasks: Task[] = [];
    for (const file of files.filter(f => f.endsWith('.md') || f.endsWith('.yml'))) {
      const filePath = path.join(tasksDir, file);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        let data: Record<string, unknown>;
        let body: string;
        if (file.endsWith('.yml')) {
          data = (yaml.load(content) ?? {}) as Record<string, unknown>;
          body = '';
        } else {
          ({ data, body } = parseFrontmatter(content));
        }
        const basename = file.endsWith('.yml') ? path.basename(file, '.yml') : path.basename(file, '.md');
        tasks.push({
          id: String(data['id'] ?? basename),
          title: String(data['title'] ?? file),
          description: data['description'] !== undefined ? String(data['description']) : undefined,
          goal: data['goal'] !== undefined ? String(data['goal']) : undefined,
          status: (data['status'] as TaskStatus) ?? 'open',
          owner: data['owner'] !== undefined ? String(data['owner']) : undefined,
          affectedFiles: Array.isArray(data['affectedFiles'])
            ? (data['affectedFiles'] as unknown[]).map(String)
            : undefined,
          body,
          filePath,
        });
      } catch {
        // skip unreadable files
      }
    }

    return tasks.sort((a, b) => a.id.localeCompare(b.id));
  }

  async getRuns(taskId: string): Promise<Run[]> {
    const runsDir = path.join(this._agentsDir, 'runs');
    let files: string[];
    try {
      files = await fs.readdir(runsDir);
    } catch {
      return [];
    }

    const runs: Run[] = [];
    for (const file of files.filter(f => f.endsWith('.json'))) {
      const filePath = path.join(runsDir, file);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content) as Partial<Run>;
        if (data.taskId !== taskId) { continue; }
        runs.push({
          id: data.id ?? path.basename(file, '.json'),
          taskId: data.taskId ?? taskId,
          runner: data.runner ?? 'unknown',
          startTime: data.startTime ?? '',
          endTime: data.endTime,
          status: data.status ?? 'completed',
          logs: data.logs,
          summary: data.summary,
          diffRef: data.diffRef,
          installHint: data.installHint,
          conversationId: data.conversationId,
          sessionId: data.sessionId,
          turnIndex: data.turnIndex,
          filePath,
        });
      } catch {
        // skip malformed files
      }
    }

    return runs.sort((a, b) => b.startTime.localeCompare(a.startTime));
  }

  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
    const tasks = await this.getTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) { throw new Error(`Task ${taskId} not found`); }

    const content = await fs.readFile(task.filePath, 'utf-8');
    const updated = content.replace(
      /^(status:\s*)(.+)$/m,
      `$1${status}`
    );
    await fs.writeFile(task.filePath, updated, 'utf-8');
  }

  async saveRun(run: Run): Promise<void> {
    const runsDir = path.join(this._agentsDir, 'runs');
    await fs.mkdir(runsDir, { recursive: true });
    const filePath = path.join(runsDir, `${run.id}.json`);
    const { filePath: _, ...data } = run;
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async getProject(): Promise<Project | undefined> {
    const projectFile = path.join(this._agentsDir, 'project.yml');
    try {
      const content = await fs.readFile(projectFile, 'utf-8');
      const data = yaml.load(content) as Partial<Project>;
      return {
        name: data.name ?? 'Unnamed Project',
        goal: data.goal ?? '',
        repoPath: data.repoPath,
        rules: data.rules,
        techStack: data.techStack,
      };
    } catch {
      return undefined;
    }
  }

  dispose(): void {
    this._watcher.dispose();
    this._onDidChange.dispose();
  }
}
