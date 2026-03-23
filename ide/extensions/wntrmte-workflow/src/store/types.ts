import type {
  Decision as PatchbayDecision,
  Project,
  Run as PatchbayRun,
  Task as PatchbayTask,
  TaskStatus,
} from '@patchbay/core';

export type { Project, TaskStatus };

export type Task = PatchbayTask & {
  body?: string;
  filePath: string;
};

export type Run = PatchbayRun & {
  filePath: string;
};

export type Decision = PatchbayDecision & {
  filePath: string;
};
