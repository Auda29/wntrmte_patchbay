import { Orchestrator } from '@patchbay/core';
import { ServerResponse } from 'http';
import { sendJson } from '../utils';

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
            };
        })
    );

    sendJson(response, 200, result);
}
