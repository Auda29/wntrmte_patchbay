import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { Run } from '../store/types';

const SCHEME = 'wntrmte-run';

/** Virtual document provider — shows run log as read-only text. */
export class RunLogProvider implements vscode.TextDocumentContentProvider {
  static readonly scheme = SCHEME;

  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  provideTextDocumentContent(uri: vscode.Uri): string {
    // Content is encoded in the URI fragment as JSON (set by openRun command)
    try {
      const run = JSON.parse(decodeURIComponent(uri.fragment)) as Run;
      const lines: string[] = [
        `Run: ${run.id}`,
        `Task: ${run.taskId}`,
        `Runner: ${run.runner}`,
        `Status: ${run.status}`,
        `Start: ${run.startTime}`,
        run.endTime ? `End:   ${run.endTime}` : '',
        '',
        run.summary ? `Summary:\n${run.summary}\n` : '',
        run.logs?.length ? `Logs:\n${run.logs.join('\n')}` : '(no logs)',
      ];
      return lines.filter(l => l !== '').join('\n');
    } catch {
      return '(failed to parse run data)';
    }
  }

  /** Open the run log for a given Run object. */
  static async open(run: Run): Promise<void> {
    // Try to read the actual JSON file first for full fidelity
    let content: string;
    try {
      content = await fs.readFile(run.filePath, 'utf-8');
    } catch {
      content = JSON.stringify(run, null, 2);
    }

    // Show in a new untitled editor with JSON syntax
    const doc = await vscode.workspace.openTextDocument({
      language: 'json',
      content,
    });
    await vscode.window.showTextDocument(doc, { preview: true });
  }
}
