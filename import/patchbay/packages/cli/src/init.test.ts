import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// Requires `npm run build --workspace=packages/cli` to be run first.
const CLI_BIN = path.resolve(__dirname, '../dist/index.js');

function cliAvailable(): boolean {
    return fs.existsSync(CLI_BIN);
}

describe('patchbay init --yes', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patchbay-cli-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('creates all five .project-agents subdirectories', () => {
        if (!cliAvailable()) {
            console.warn('Skipping: CLI binary not built. Run: npm run build --workspace=packages/cli');
            return;
        }

        execSync(
            `node "${CLI_BIN}" init --yes --name "Test Project" --goal "Test goal" --tech-stack "TypeScript"`,
            { cwd: tmpDir, stdio: 'pipe' }
        );

        const base = path.join(tmpDir, '.project-agents');
        expect(fs.existsSync(base)).toBe(true);
        for (const dir of ['tasks', 'runs', 'decisions', 'agents', 'context']) {
            expect(fs.existsSync(path.join(base, dir)), `Expected subdir: ${dir}`).toBe(true);
        }
    });

    it('writes project.yml with the provided name and goal', () => {
        if (!cliAvailable()) return;

        execSync(
            `node "${CLI_BIN}" init --yes --name "My Repo" --goal "Build a CLI tool"`,
            { cwd: tmpDir, stdio: 'pipe' }
        );

        const projectYml = fs.readFileSync(
            path.join(tmpDir, '.project-agents', 'project.yml'),
            'utf-8'
        );
        expect(projectYml).toContain('My Repo');
        expect(projectYml).toContain('Build a CLI tool');
    });

    it('uses auto-detected values and bootstraps context files in --yes mode', () => {
        if (!cliAvailable()) return;

        fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
            name: 'detected-repo',
            description: 'Auto-detected goal',
            devDependencies: { typescript: '^5.0.0' }
        }, null, 2));
        fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');
        fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Detected Repo\n\nImported context.\n');
        fs.mkdirSync(path.join(tmpDir, '.github', 'workflows'), { recursive: true });
        fs.writeFileSync(path.join(tmpDir, '.github', 'workflows', 'build.yml'), 'name: Build\n');
        fs.writeFileSync(path.join(tmpDir, 'vitest.config.ts'), 'export default {}\n');

        execSync(
            `node "${CLI_BIN}" init --yes`,
            { cwd: tmpDir, stdio: 'pipe' }
        );

        const projectYml = fs.readFileSync(path.join(tmpDir, '.project-agents', 'project.yml'), 'utf-8');
        const architecture = fs.readFileSync(path.join(tmpDir, '.project-agents', 'context', 'architecture.md'), 'utf-8');
        const conventions = fs.readFileSync(path.join(tmpDir, '.project-agents', 'context', 'conventions.md'), 'utf-8');

        expect(projectYml).toContain('detected-repo');
        expect(projectYml).toContain('Auto-detected goal');
        expect(projectYml).toContain('- Node.js');
        expect(projectYml).toContain('- TypeScript');
        expect(architecture).toContain('# Detected Repo');
        expect(conventions).toContain('CI uses GitHub Actions (build.yml).');
        expect(conventions).toContain('Tests are configured with Vitest.');
    });

    it('exits with error when already initialized', () => {
        if (!cliAvailable()) return;

        execSync(
            `node "${CLI_BIN}" init --yes`,
            { cwd: tmpDir, stdio: 'pipe' }
        );

        expect(() =>
            execSync(`node "${CLI_BIN}" init --yes`, { cwd: tmpDir, stdio: 'pipe' })
        ).toThrow();
    });
});
