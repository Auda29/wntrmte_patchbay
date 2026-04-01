export interface ConversationTurn {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}

export interface RunnerInput {
    taskId: string;
    /** Stable Patchbay session ID for interactive connectors. */
    sessionId?: string;
    repoPath: string;
    branch: string;
    affectedFiles?: string[];
    contextFiles?: string[];
    projectRules?: string;
    goal: string;
    outputFormat?: string;
    /** Conversation thread being continued. */
    conversationId?: string;
    /** Runner-native session ID to resume (e.g. claude --resume <id>). */
    resumeSessionId?: string;
    /** Runner-native source session/thread ID to fork from when supported. */
    forkSessionId?: string;
    /** Previous turns for context injection (fallback when native resume is unavailable). */
    previousTurns?: ConversationTurn[];
}

export interface RunnerOutput {
    status: 'completed' | 'failed' | 'blocked' | 'awaiting_input';
    summary: string;
    changedFiles?: string[];
    diffRef?: string;
    logs: string[];
    blockers?: string[];
    suggestedNextSteps?: string[];
    /** Shell command that would install the missing CLI tool (e.g. "npm install -g @anthropic-ai/claude-code"). */
    installHint?: string;
    /** Runner-native session ID for resuming this conversation. */
    sessionId?: string;
    /** The specific question being asked (extracted from output). */
    question?: string;
}

export interface Runner {
    name: string;
    execute(input: RunnerInput): Promise<RunnerOutput>;
}

/** Build a structured prompt string from RunnerInput (shared across all CLI runners). */
export function buildPrompt(input: RunnerInput): string {
    const fs = require('fs');
    const path = require('path');
    const parts: string[] = [];

    if (input.previousTurns?.length) {
        const turnLines = input.previousTurns.map(
            (t: ConversationTurn) => `### ${t.role} (${t.timestamp})\n${t.content}`
        );
        parts.push(`## Previous Conversation\n${turnLines.join('\n\n')}`);
    }

    if (input.projectRules) {
        parts.push(`## Project Rules\n${input.projectRules}`);
    }

    if (input.contextFiles?.length) {
        const contextParts = input.contextFiles
            .filter((f: string) => fs.existsSync(f))
            .map((f: string) => `### ${path.basename(f)}\n${fs.readFileSync(f, 'utf-8')}`);
        if (contextParts.length) {
            parts.push(`## Context\n${contextParts.join('\n\n')}`);
        }
    }

    if (input.affectedFiles?.length) {
        parts.push(`## Affected Files\n${input.affectedFiles.map((f: string) => `- ${f}`).join('\n')}`);
    }

    parts.push(`## Task\n${input.goal}`);

    return parts.join('\n\n');
}
