import * as vscode from 'vscode';
import { Task, TaskStatus, Run, Project } from './types';

export interface PatchbayStore {
  readonly onDidChange: vscode.Event<void>;
  getTasks(): Promise<Task[]>;
  getRuns(taskId: string): Promise<Run[]>;
  updateTaskStatus(taskId: string, status: TaskStatus): Promise<void>;
  getProject(): Promise<Project | undefined>;
  saveRun(run: Run): Promise<void>;
  dispose(): void;
}
