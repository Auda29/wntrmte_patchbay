import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ServerResponse } from 'http';
import { sendJson } from '../utils';
import { createConfiguredOrchestrator } from '../runtime';
import type { ConnectorCapabilities } from '@patchbay/core';

const execAsync = promisify(exec);

const installHints: Record<string, string> = {
    'claude-code': 'npm install -g @anthropic-ai/claude-code',
    'codex': 'npm install -g @openai/codex',
    'gemini': 'npm install -g @google/gemini-cli',
    'cursor-cli': 'https://cursor.com/download',
};

const cliBinaries: Record<string, string> = {
    'claude-code': 'claude',
    'codex': 'codex',
    'gemini': 'gemini',
    'cursor-cli': 'cursor',
};

async function checkBinary(name: string): Promise<boolean> {
    const cmd = process.platform === 'win32' ? `where ${name}` : `which ${name}`;
    try {
        await execAsync(cmd);
        return true;
    } catch {
        return false;
    }
}

export async function getAgents(agentsDir: string, response: ServerResponse) {
    const agentProfilesDir = path.join(agentsDir, 'agents');
    const repoRoot = path.dirname(agentsDir);
    const orchestrator = createConfiguredOrchestrator(repoRoot);
    const connectorMap = new Map<string, ConnectorCapabilities>(
        orchestrator.listConnectors().map((connector) => [connector.id, connector.capabilities])
    );

    let agents: { id: string; role?: string; toolType?: string; [key: string]: unknown }[] = [];

    if (fs.existsSync(agentProfilesDir)) {
        agents = fs.readdirSync(agentProfilesDir)
            .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
            .map(f => {
                const id = f.replace(/\.ya?ml$/, '');
                const raw = fs.readFileSync(path.join(agentProfilesDir, f), 'utf-8');
                const profile = yaml.parse(raw) as Record<string, unknown>;
                return { id, ...profile };
            });
    }

    // Include built-in runner types
    const builtInRunners = [
        { id: 'bash', role: 'Shell Command Runner', toolType: 'bash' },
        { id: 'http', role: 'HTTP Request Runner', toolType: 'http' },
        { id: 'cursor', role: 'Cursor (file-based)', toolType: 'cursor' },
        { id: 'cursor-cli', role: 'Cursor CLI (agent -p)', toolType: 'cursor-cli' },
        { id: 'claude-code', role: 'Claude Code (CLI)', toolType: 'claude-code' },
        { id: 'codex', role: 'OpenAI Codex (CLI)', toolType: 'codex' },
        { id: 'gemini', role: 'Google Gemini (CLI)', toolType: 'gemini' },
    ];

    const existingIds = new Set(agents.map(a => a.id));
    for (const runner of builtInRunners) {
        if (!existingIds.has(runner.id)) agents.push(runner);
    }

    // Check availability of CLI-based runners in parallel
    const enriched = await Promise.all(agents.map(async (agent) => {
        const bin = cliBinaries[agent.id];
        const connectorCapabilities = connectorMap.get(agent.id);
        const supportsConnector = connectorCapabilities !== undefined;
        if (!bin) {
            return {
                ...agent,
                available: true,
                supportsConnector,
                connectorId: supportsConnector ? agent.id : undefined,
                connectorCapabilities,
            };
        }
        const available = await checkBinary(bin);
        return {
            ...agent,
            available,
            installHint: available ? undefined : installHints[agent.id],
            supportsConnector,
            connectorId: supportsConnector ? agent.id : undefined,
            connectorCapabilities,
        };
    }));

    sendJson(response, 200, enriched);
}
