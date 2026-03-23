import * as vscode from 'vscode';
import type { Project, TaskStatus } from '@patchbay/core';
import { Task, Run } from './types';

export interface PatchbayStore {
  readonly onDidChange: vscode.Event<void>;
  getTasks(): Promise<Task[]>;
  getRuns(taskId: string): Promise<Run[]>;
  updateTaskStatus(taskId: string, status: TaskStatus): Promise<void>;
  getProject(): Promise<Project | undefined>;
  saveRun(run: Run): Promise<void>;
  dispose(): void;
}
