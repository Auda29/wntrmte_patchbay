// Types aligned with @patchbay/core — do not diverge from patchbay/schema/

export type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'review' | 'done' | 'awaiting_input';
export type RunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface Task {
  id: string;
  title: string;
  description?: string;
  goal?: string;
  status: TaskStatus;
  owner?: string;
  affectedFiles?: string[];
  /** Raw markdown body after frontmatter */
  body?: string;
  /** Source file path (absolute) */
  filePath: string;
}

export interface Run {
  id: string;
  taskId: string;
  runner: string;
  startTime: string;
  endTime?: string;
  status: RunStatus;
  logs?: string[];
  summary?: string;
  diffRef?: string;
  /** Shell command to install a missing runner CLI (propagated from RunnerOutput). */
  installHint?: string;
  /** Conversation threading fields (multi-turn runner conversations). */
  conversationId?: string;
  sessionId?: string;
  turnIndex?: number;
  /** Source file path (absolute) */
  filePath: string;
}

export interface Decision {
  id: string;
  title: string;
  rationale: string;
  proposedBy?: string;
  approvedBy?: string;
  timestamp: string;
  filePath: string;
}

export interface Project {
  name: string;
  repoPath?: string;
  goal: string;
  rules?: string[];
  techStack?: string[];
}
