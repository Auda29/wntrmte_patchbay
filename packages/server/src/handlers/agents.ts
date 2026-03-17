import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { ServerResponse } from 'http';
import { sendJson } from '../utils';

export function getAgents(agentsDir: string, response: ServerResponse) {
    const agentProfilesDir = path.join(agentsDir, 'agents');

    if (!fs.existsSync(agentProfilesDir)) {
        sendJson(response, 200, []);
        return;
    }

    const agents = fs.readdirSync(agentProfilesDir)
        .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
        .map(f => {
            const id = f.replace(/\.ya?ml$/, '');
            const raw = fs.readFileSync(path.join(agentProfilesDir, f), 'utf-8');
            const profile = yaml.parse(raw) as Record<string, unknown>;
            return { id, ...profile };
        });

    sendJson(response, 200, agents);
}
