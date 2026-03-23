import * as vscode from 'vscode';
import { PatchbayStore } from './PatchbayStore';
import { Task, TaskStatus, Run, Project } from './types';

const MAX_SSE_FAILURES = 3;
const POLL_INTERVAL_MS = 5000;
const SSE_RECONNECT_MS = 2000;

export class ApiStore implements PatchbayStore {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private _eventSource: import('eventsource') | null = null;
  private _sseFailures = 0;
  private _pollTimer: ReturnType<typeof setInterval> | null = null;
  private _disposed = false;

  constructor(private readonly _baseUrl: string) {
    this._connectSSE();
  }

  private async _connectSSE(): Promise<void> {
    if (this._disposed) return;

    try {
      const EventSource = (await import('eventsource')).default;
      this._eventSource = new EventSource(`${this._baseUrl}/api/events`);

      this._eventSource.onmessage = () => {
        this._sseFailures = 0;
        this._onDidChange.fire();
      };

      this._eventSource.onerror = () => {
        this._sseFailures++;
        this._eventSource?.close();
        this._eventSource = null;

        if (this._sseFailures >= MAX_SSE_FAILURES) {
          // Fall back to polling
          this._startPolling();
        } else if (!this._disposed) {
          setTimeout(() => this._connectSSE(), SSE_RECONNECT_MS * this._sseFailures);
        }
      };

      // SSE connected — stop polling if active
      this._stopPolling();
    } catch {
      // eventsource module not available — fall back to polling
      this._startPolling();
    }
  }

  private _startPolling(): void {
    if (this._pollTimer || this._disposed) return;
    this._pollTimer = setInterval(() => {
      this._onDidChange.fire();
    }, POLL_INTERVAL_MS);
  }

  private _stopPolling(): void {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  async getTasks(): Promise<Task[]> {
    const res = await fetch(`${this._baseUrl}/api/state`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.tasks || []).map((t: Record<string, unknown>) => ({
      ...t,
      filePath: '',
    })) as Task[];
  }

  async getRuns(taskId: string): Promise<Run[]> {
    const res = await fetch(`${this._baseUrl}/api/runs?taskId=${encodeURIComponent(taskId)}`);
    if (!res.ok) return [];
    const runs = await res.json();
    return (runs || []).map((r: Record<string, unknown>) => ({
      ...r,
      filePath: '',
    })) as Run[];
  }

  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
    const res = await fetch(`${this._baseUrl}/api/tasks`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, status }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`Failed to update task: ${err.error}`);
    }
  }

  async getProject(): Promise<Project | undefined> {
    const res = await fetch(`${this._baseUrl}/api/state`);
    if (!res.ok) return undefined;
    const data = await res.json();
    return data.project ?? undefined;
  }

  async saveRun(run: Run): Promise<void> {
    const { filePath: _, ...data } = run;
    const res = await fetch(`${this._baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`Failed to save run: ${err.error}`);
    }
  }

  dispose(): void {
    this._disposed = true;
    this._eventSource?.close();
    this._eventSource = null;
    this._stopPolling();
    this._onDidChange.dispose();
  }
}
