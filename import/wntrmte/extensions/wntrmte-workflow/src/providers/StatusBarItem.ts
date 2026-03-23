import * as vscode from 'vscode';
import { PatchbayStore } from '../store/PatchbayStore';
import { Task } from '../store/types';

export class WorkflowStatusBar implements vscode.Disposable {
  private readonly _item: vscode.StatusBarItem;

  constructor(private readonly store: PatchbayStore) {
    this._item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      10
    );
    this._item.command = 'wntrmte.refresh';
    this._item.tooltip = 'Patchbay — click to refresh';

    store.onDidChange(() => this._update());
    this._update();
    this._item.show();
  }

  private async _update(): Promise<void> {
    let tasks: Task[];
    try {
      tasks = await this.store.getTasks();
    } catch {
      this._item.text = '$(warning) Patchbay: error';
      return;
    }

    const open = tasks.filter(t => t.status === 'open').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const blocked = tasks.filter(t => t.status === 'blocked').length;

    const parts: string[] = [];
    if (inProgress > 0) { parts.push(`${inProgress} running`); }
    if (blocked > 0)    { parts.push(`${blocked} blocked`); }
    if (open > 0)       { parts.push(`${open} open`); }

    const summary = parts.length > 0 ? parts.join(' · ') : 'all done';
    this._item.text = `$(project) Patchbay: ${summary}`;
  }

  dispose(): void {
    this._item.dispose();
  }
}
