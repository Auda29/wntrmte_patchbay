export interface RunnerInput {
    taskId: string;
    repoPath: string;
    branch: string;
    affectedFiles?: string[];
    contextFiles?: string[];
    projectRules?: string;
    goal: string;
    outputFormat?: string;
}

export interface RunnerOutput {
    status: 'completed' | 'failed' | 'blocked';
    summary: string;
    changedFiles?: string[];
    diffRef?: string;
    logs: string[];
    blockers?: string[];
    suggestedNextSteps?: string[];
}

export interface Runner {
    name: string;
    execute(input: RunnerInput): Promise<RunnerOutput>;
}
