import { Orchestrator, loadConfig } from '@patchbay/core';
import { BashRunner } from '@patchbay/runner-bash';
import { HttpRunner } from '@patchbay/runner-http';
import { CursorRunner } from '@patchbay/runner-cursor';
import { ClaudeCodeRunner, ClaudeCodeConnector } from '@patchbay/runner-claude-code';
import { CursorCliRunner } from '@patchbay/runner-cursor-cli';
import { CodexRunner, CodexConnector } from '@patchbay/runner-codex';
import { GeminiRunner, GeminiConnector } from '@patchbay/runner-gemini';

export function createConfiguredOrchestrator(repoRoot: string = process.cwd()): Orchestrator {
    const cfg = loadConfig();
    const r = cfg.runners;
    const orchestrator = new Orchestrator(repoRoot);

    // Batch Runners
    orchestrator.registerRunner('bash', new BashRunner());
    orchestrator.registerRunner('http', new HttpRunner());
    orchestrator.registerRunner('cursor', new CursorRunner());
    orchestrator.registerRunner('cursor-cli', new CursorCliRunner(r['cursor-cli']));
    orchestrator.registerRunner('claude-code', new ClaudeCodeRunner(r['claude-code']));
    orchestrator.registerRunner('codex', new CodexRunner(r['codex']));
    orchestrator.registerRunner('gemini', new GeminiRunner(r['gemini']));

    // Streaming Connectors
    orchestrator.registerConnector(new ClaudeCodeConnector(r['claude-code']));
    orchestrator.registerConnector(new CodexConnector(r['codex']));
    orchestrator.registerConnector(new GeminiConnector(r['gemini']));

    return orchestrator;
}
