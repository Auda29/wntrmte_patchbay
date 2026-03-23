import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type RunnerAuth =
    | { mode: 'subscription' }
    | { mode: 'apiKey'; apiKey: string };

export interface PatchbayConfig {
    runners: Record<string, RunnerAuth>;
}

function getConfigDir(): string {
    return path.join(os.homedir(), '.patchbay');
}

function getConfigPath(): string {
    return path.join(getConfigDir(), 'config.json');
}

export function loadConfig(): PatchbayConfig {
    const configPath = getConfigPath();
    try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<PatchbayConfig>;
        return { runners: parsed.runners ?? {} };
    } catch {
        return { runners: {} };
    }
}

export function saveConfig(config: PatchbayConfig): void {
    const configDir = getConfigDir();
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }

    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    // chmod 600 on Unix/Mac (ignore errors on Windows)
    try {
        fs.chmodSync(configPath, 0o600);
    } catch {
        // Windows doesn't support Unix permissions
    }
}

/** Mask an API key for display: show first 7 chars + "..." */
export function maskApiKey(key: string): string {
    if (key.length <= 10) return '***';
    return key.slice(0, 7) + '...';
}
