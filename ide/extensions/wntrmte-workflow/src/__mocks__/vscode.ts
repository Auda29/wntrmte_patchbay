/** Minimal vscode mock for unit tests (no Display Server required). */

export class EventEmitter<T> {
  private readonly listeners: Array<(data: T) => void> = [];

  readonly event = (listener: (data: T) => void): { dispose(): void } => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const i = this.listeners.indexOf(listener);
        if (i >= 0) { this.listeners.splice(i, 1); }
      },
    };
  };

  fire(data: T): void {
    for (const listener of this.listeners) {
      listener(data);
    }
  }

  dispose(): void {
    this.listeners.length = 0;
  }
}

export class RelativePattern {
  constructor(public base: unknown, public pattern: string) {}
}

export const Uri = {
  file: (fsPath: string) => ({ fsPath, toString: () => fsPath }),
};

const stubWatcher = () => ({
  onDidCreate: (_fn: () => void) => ({ dispose: () => {} }),
  onDidChange: (_fn: () => void) => ({ dispose: () => {} }),
  onDidDelete: (_fn: () => void) => ({ dispose: () => {} }),
  dispose: () => {},
});

export const workspace = {
  createFileSystemWatcher: () => stubWatcher(),
  getConfiguration: (_section?: string) => ({
    get: <T>(_key: string, defaultValue: T): T => defaultValue,
  }),
  workspaceFolders: undefined as undefined,
};

export const window = {
  showInformationMessage: async () => undefined,
  showWarningMessage: async () => undefined,
  showErrorMessage: async () => undefined,
};

export const commands = {
  executeCommand: async () => undefined,
};

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}
