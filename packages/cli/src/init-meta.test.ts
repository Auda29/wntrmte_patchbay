import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { bootstrapContextFiles, detectProjectMeta } from './init-meta';

function makeTempRepo(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'patchbay-init-meta-'));
}

describe('detectProjectMeta', () => {
    it('detects name, goal, stack, and repo URL from a Node/TypeScript repo', () => {
        const repoRoot = makeTempRepo();

        try {
            fs.writeFileSync(path.join(repoRoot, 'package.json'), JSON.stringify({
                name: 'patchbay',
                description: 'Lightweight control plane',
                dependencies: { next: '^15.0.0', react: '^19.0.0' },
                devDependencies: { typescript: '^5.0.0', tailwindcss: '^4.0.0' }
            }, null, 2));
            fs.writeFileSync(path.join(repoRoot, 'tsconfig.json'), '{}');
            fs.mkdirSync(path.join(repoRoot, '.git'));
            fs.writeFileSync(path.join(repoRoot, '.git', 'config'), [
                '[remote "origin"]',
                '    url = https://github.com/example/patchbay.git'
            ].join('\n'));

            const meta = detectProjectMeta(repoRoot);

            expect(meta.name).toBe('patchbay');
            expect(meta.goal).toBe('Lightweight control plane');
            expect(meta.repoUrl).toBe('https://github.com/example/patchbay.git');
            expect(meta.techStack).toEqual([
                'Node.js',
                'TypeScript',
                'Next.js',
                'React',
                'Tailwind CSS'
            ]);
        } finally {
            fs.rmSync(repoRoot, { recursive: true, force: true });
        }
    });

    it('falls back to Python, Rust, and Go metadata when package.json is absent', () => {
        const repoRoot = makeTempRepo();

        try {
            fs.writeFileSync(path.join(repoRoot, 'pyproject.toml'), [
                '[project]',
                'name = "python-tool"',
                'description = "CLI helper"'
            ].join('\n'));
            fs.writeFileSync(path.join(repoRoot, 'Cargo.toml'), [
                '[package]',
                'name = "rust-tool"',
                'description = "Fast worker"'
            ].join('\n'));
            fs.writeFileSync(path.join(repoRoot, 'go.mod'), 'module github.com/example/go-tool\n');
            fs.writeFileSync(path.join(repoRoot, 'pytest.ini'), '[pytest]\n');

            const meta = detectProjectMeta(repoRoot);

            expect(meta.name).toBe('python-tool');
            expect(meta.goal).toBe('CLI helper');
            expect(meta.techStack).toEqual(['Python', 'Rust', 'Go']);
        } finally {
            fs.rmSync(repoRoot, { recursive: true, force: true });
        }
    });
});

describe('bootstrapContextFiles', () => {
    afterEach(() => {
        // no-op placeholder to keep test structure parallel to the CLI tests
    });

    it('creates architecture and conventions context from README, CI, and test setup', () => {
        const repoRoot = makeTempRepo();

        try {
            fs.mkdirSync(path.join(repoRoot, '.project-agents', 'context'), { recursive: true });
            fs.mkdirSync(path.join(repoRoot, '.github', 'workflows'), { recursive: true });
            fs.writeFileSync(path.join(repoRoot, 'README.md'), '# Patchbay\n\nProject overview.\n');
            fs.writeFileSync(path.join(repoRoot, '.github', 'workflows', 'build.yml'), 'name: Build\n');
            fs.writeFileSync(path.join(repoRoot, 'Makefile'), 'test:\n\tvitest\n');
            fs.writeFileSync(path.join(repoRoot, 'vitest.config.ts'), 'export default {}\n');

            bootstrapContextFiles(repoRoot, {
                name: 'patchbay',
                goal: 'Project overview',
                techStack: ['Node.js', 'TypeScript'],
                repoUrl: 'https://github.com/example/patchbay.git'
            });

            const architecture = fs.readFileSync(
                path.join(repoRoot, '.project-agents', 'context', 'architecture.md'),
                'utf8'
            );
            const conventions = fs.readFileSync(
                path.join(repoRoot, '.project-agents', 'context', 'conventions.md'),
                'utf8'
            );

            expect(architecture).toContain('Starter context imported from the repository README');
            expect(architecture).toContain('Repository: https://github.com/example/patchbay.git');
            expect(architecture).toContain('# Patchbay');

            expect(conventions).toContain('CI uses GitHub Actions (build.yml).');
            expect(conventions).toContain('A `Makefile` is present for common project tasks.');
            expect(conventions).toContain('Tests are configured with Vitest.');
        } finally {
            fs.rmSync(repoRoot, { recursive: true, force: true });
        }
    });
});
