import { Orchestrator } from '@patchbay/core';
import { ServerResponse } from 'http';
import { sendJson } from '../utils';

const installHints: Record<string, string> = {
    'claude-code': 'npm install -g @anthropic-ai/claude-code',
    'codex': 'npm install -g @openai/codex',
    'gemini': 'npm install -g @google/gemini-cli',
    'cursor-cli': 'https://cursor.com/download',
};

export async function getConnectors(
    orchestrator: Orchestrator,
    response: ServerResponse
) {
    const connectors = orchestrator.listConnectors();

    const result = await Promise.all(
        connectors.map(async (c) => {
            let available = false;
            try {
                available = await c.isAvailable();
            } catch {
                // treat check failure as unavailable
            }
            return {
                id: c.id,
                name: c.name,
                capabilities: c.capabilities,
                available,
                installHint: available ? undefined : installHints[c.id],
            };
        })
    );

    sendJson(response, 200, result);
}
