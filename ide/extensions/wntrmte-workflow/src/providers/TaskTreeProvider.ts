import * as vscode from 'vscode';
import { PatchbayStore } from '../store/PatchbayStore';
import type { TaskStatus } from '@patchbay/core';
import { Task, Run } from '../store/types';

const STATUS_ORDER: TaskStatus[] = ['awaiting_input', 'in_progress', 'blocked', 'review', 'open', 'done'];

const STATUS_ICONS: Record<TaskStatus, string> = {
  open:           'circle-outline',
  in_progress:    'sync',
  blocked:        'error',
  review:         'eye',
  done:           'check',
  awaiting_input: 'comment-discussion',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  open:           'Open',
  in_progress:    'In Progress',
  blocked:        'Blocked',
  review:         'Review',
  done:           'Done',
  awaiting_input: 'Awaiting Reply',
};

// ─── Tree node types ──────────────────────────────────────────────────────────

type TreeNode = StatusGroupNode | TaskNode | RunNode;

class StatusGroupNode extends vscode.TreeItem {
  readonly nodeType = 'group' as const;
  constructor(public readonly status: TaskStatus, count: number) {
    super(`${STATUS_LABELS[status]} (${count})`, vscode.TreeItemCollapsibleState.Expanded);
    this.iconPath = new vscode.ThemeIcon(STATUS_ICONS[status]);
    this.contextValue = 'statusGroup';
    if (status === 'done') {
      this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }
  }
}

class TaskNode extends vscode.TreeItem {
  readonly nodeType = 'task' as const;
  constructor(public readonly task: Task) {
    super(task.title, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = task.id;
    this.tooltip = task.description ?? task.title;
    this.iconPath = new vscode.ThemeIcon(STATUS_ICONS[task.status]);
    this.contextValue = 'task';
    this.command = {
      command: 'vscode.open',
      title: 'Open Task',
      arguments: [vscode.Uri.file(task.filePath)],
    };
  }
}

class RunNode extends vscode.TreeItem {
  readonly nodeType = 'run' as const;
  constructor(public readonly run: Run) {
    super(run.id, vscode.TreeItemCollapsibleState.None);
    this.description = run.status;
    this.tooltip = run.summary ?? run.id;
    this.iconPath = new vscode.ThemeIcon(
      run.status === 'completed' ? 'pass' :
      run.status === 'running'  ? 'loading~spin' : 'error'
    );
    this.contextValue = 'run';
    this.command = {
      command: 'wntrmte.openRun',
      title: 'Open Run Log',
      arguments: [run],
    };
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class TaskTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _tasks: Task[] = [];

  constructor(private readonly store: PatchbayStore) {
    store.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    if (!element) {
      // Root: status groups
      this._tasks = await this.store.getTasks();
      const groups = new Map<TaskStatus, Task[]>();
      for (const status of STATUS_ORDER) {
        groups.set(status, []);
      }
      for (const task of this._tasks) {
        groups.get(task.status)?.push(task);
      }
      return STATUS_ORDER
        .filter(s => (groups.get(s)?.length ?? 0) > 0)
        .map(s => new StatusGroupNode(s, groups.get(s)!.length));
    }

    if (element.nodeType === 'group') {
      const status = (element as StatusGroupNode).status;
      return this._tasks
        .filter(t => t.status === status)
        .map(t => new TaskNode(t));
    }

    if (element.nodeType === 'task') {
      const task = (element as TaskNode).task;
      const runs = await this.store.getRuns(task.id);
      return runs.map(r => new RunNode(r));
    }

    return [];
  }
}
