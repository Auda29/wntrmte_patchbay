export interface Project {
    name: string;
    repoPath?: string;
    goal: string;
    rules?: string[];
    techStack?: string[];
}

export interface AgentProfile {
    role: string;
    toolType: 'bash' | 'http' | 'cursor' | 'claude-code' | 'custom';
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
    status: 'open' | 'in_progress' | 'blocked' | 'review' | 'done';
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
    status: 'running' | 'completed' | 'failed' | 'cancelled';
    logs?: string[];
    summary?: string;
    diffRef?: string;
    blockers?: string[];
    suggestedNextSteps?: string[];
}

export interface Decision {
    id: string;
    title: string;
    rationale: string;
    proposedBy?: string;
    approvedBy?: string;
    timestamp: string;
}
