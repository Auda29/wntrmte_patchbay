export interface Project {
    name: string;
    repoPath?: string;
    goal: string;
    rules?: string[];
    techStack?: string[];
}

export interface AgentProfile {
    role: string;
    toolType: 'bash' | 'http' | 'cursor' | 'cursor-cli' | 'claude-code' | 'codex' | 'gemini' | 'custom';
    modelProvider?: string;
    allowedTools?: string[];
    promptProfile?: string;
    scope?: string;
}

export interface Task {
    id: string;
    title: string;
    description?: string;
    goal?: string;
    status: 'open' | 'in_progress' | 'blocked' | 'review' | 'done' | 'awaiting_input';
    owner?: string;
    affectedFiles?: string[];
    acceptanceCriteria?: string[];
    result?: string;
}

export interface Run {
    id: string;
    taskId: string;
    runner: string;
    startTime: string;
    endTime?: string;
    status: 'running' | 'completed' | 'failed' | 'cancelled' | 'awaiting_input';
    logs?: string[];
    summary?: string;
    question?: string;
    diffRef?: string;
    blockers?: string[];
    suggestedNextSteps?: string[];
    /** Shell command to install the missing runner CLI (propagated from RunnerOutput). */
    installHint?: string;
    /** Conversation thread this run belongs to. */
    conversationId?: string;
    /** Runner-native session handle for resuming (e.g. claude session UUID). */
    sessionId?: string;
    /** Index within the conversation (0 = initial, 1 = first reply, etc.). */
    turnIndex?: number;
}

export interface Decision {
    id: string;
    title: string;
    rationale: string;
    proposedBy?: string;
    approvedBy?: string;
    timestamp: string;
}
