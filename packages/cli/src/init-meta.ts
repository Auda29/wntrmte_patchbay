import * as fs from 'fs';
import * as path from 'path';

export interface DetectedProjectMeta {
    name?: string;
    goal?: string;
    techStack: string[];
    repoUrl?: string;
}

function fileExists(repoRoot: string, relativePath: string): boolean {
    return fs.existsSync(path.join(repoRoot, relativePath));
}

function readTextFile(repoRoot: string, relativePath: string): string | undefined {
    const fullPath = path.join(repoRoot, relativePath);
    if (!fs.existsSync(fullPath)) return undefined;
    return fs.readFileSync(fullPath, 'utf8');
}

function readJsonFile<T>(repoRoot: string, relativePath: string): T | undefined {
    const text = readTextFile(repoRoot, relativePath);
    if (!text) return undefined;

    try {
        return JSON.parse(text) as T;
    } catch {
        return undefined;
    }
}

function matchTomlString(content: string, key: string): string | undefined {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = content.match(new RegExp(`^\\s*${escapedKey}\\s*=\\s*["']([^"']+)["']\\s*$`, 'm'));
    return match?.[1]?.trim();
}

function readPackageMeta(repoRoot: string): { name?: string; description?: string; deps: string[] } | undefined {
    const pkg = readJsonFile<{
        name?: string;
        description?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
    }>(repoRoot, 'package.json');

    if (!pkg) return undefined;

    const depNames = [
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.devDependencies ?? {})
    ];

    return {
        name: pkg.name?.trim(),
        description: pkg.description?.trim(),
        deps: depNames
    };
}

function readPyprojectMeta(repoRoot: string): { name?: string; description?: string } | undefined {
    const content = readTextFile(repoRoot, 'pyproject.toml');
    if (!content) return undefined;

    return {
        name: matchTomlString(content, 'name'),
        description: matchTomlString(content, 'description')
    };
}

function readCargoMeta(repoRoot: string): { name?: string; description?: string } | undefined {
    const content = readTextFile(repoRoot, 'Cargo.toml');
    if (!content) return undefined;

    return {
        name: matchTomlString(content, 'name'),
        description: matchTomlString(content, 'description')
    };
}

function readGoMeta(repoRoot: string): { name?: string } | undefined {
    const content = readTextFile(repoRoot, 'go.mod');
    if (!content) return undefined;

    const match = content.match(/^\s*module\s+([^\s]+)\s*$/m);
    if (!match) return undefined;

    const modulePath = match[1].trim();
    const name = modulePath.split('/').filter(Boolean).pop();
    return { name };
}

function readRepoUrl(repoRoot: string): string | undefined {
    const content = readTextFile(repoRoot, path.join('.git', 'config'));
    if (!content) return undefined;

    const match = content.match(/\[remote "origin"\][\s\S]*?^\s*url\s*=\s*(.+)\s*$/m);
    return match?.[1]?.trim();
}

function unique(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
}

export function detectProjectMeta(repoRoot: string): DetectedProjectMeta {
    const packageMeta = readPackageMeta(repoRoot);
    const pyprojectMeta = readPyprojectMeta(repoRoot);
    const cargoMeta = readCargoMeta(repoRoot);
    const goMeta = readGoMeta(repoRoot);
    const repoUrl = readRepoUrl(repoRoot);

    const techStack: string[] = [];

    if (packageMeta) {
        techStack.push('Node.js');
        if (packageMeta.deps.includes('typescript') || fileExists(repoRoot, 'tsconfig.json')) {
            techStack.push('TypeScript');
        }
        if (packageMeta.deps.includes('next')) {
            techStack.push('Next.js');
        }
        if (packageMeta.deps.includes('react')) {
            techStack.push('React');
        }
        if (packageMeta.deps.includes('tailwindcss')) {
            techStack.push('Tailwind CSS');
        }
    }

    if (pyprojectMeta || fileExists(repoRoot, 'pytest.ini')) {
        techStack.push('Python');
    }
    if (cargoMeta) {
        techStack.push('Rust');
    }
    if (goMeta) {
        techStack.push('Go');
    }

    return {
        name: packageMeta?.name || pyprojectMeta?.name || cargoMeta?.name || goMeta?.name,
        goal: packageMeta?.description || pyprojectMeta?.description || cargoMeta?.description,
        techStack: unique(techStack),
        repoUrl
    };
}

function detectCiNotes(repoRoot: string): string[] {
    const notes: string[] = [];
    const githubWorkflowDir = path.join(repoRoot, '.github', 'workflows');

    if (fs.existsSync(githubWorkflowDir)) {
        const workflows = fs.readdirSync(githubWorkflowDir)
            .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
            .sort();
        if (workflows.length > 0) {
            notes.push(`CI uses GitHub Actions (${workflows.join(', ')}).`);
        }
    }

    if (fileExists(repoRoot, '.gitlab-ci.yml')) {
        notes.push('CI uses GitLab CI (`.gitlab-ci.yml`).');
    }

    if (fileExists(repoRoot, 'Makefile')) {
        notes.push('A `Makefile` is present for common project tasks.');
    }

    return notes;
}

function detectTestNotes(repoRoot: string): string[] {
    const notes: string[] = [];

    if (fileExists(repoRoot, 'vitest.config.ts') || fileExists(repoRoot, 'vitest.config.js')) {
        notes.push('Tests are configured with Vitest.');
    }

    if (
        fileExists(repoRoot, 'jest.config.js') ||
        fileExists(repoRoot, 'jest.config.cjs') ||
        fileExists(repoRoot, 'jest.config.ts')
    ) {
        notes.push('Tests are configured with Jest.');
    }

    if (fileExists(repoRoot, 'pytest.ini')) {
        notes.push('Tests are configured with pytest.');
    }

    return notes;
}

export function bootstrapContextFiles(repoRoot: string, meta: DetectedProjectMeta): void {
    const contextDir = path.join(repoRoot, '.project-agents', 'context');
    const architecturePath = path.join(contextDir, 'architecture.md');
    const conventionsPath = path.join(contextDir, 'conventions.md');
    const readme = readTextFile(repoRoot, 'README.md');

    if (readme?.trim()) {
        const architectureSections = [
            '# Architecture Context',
            '',
            'Starter context imported from the repository README during `patchbay init`.',
            'Review and trim this file once the key architecture notes are captured.',
            meta.repoUrl ? `Repository: ${meta.repoUrl}` : undefined,
            '',
            '---',
            '',
            readme.trim()
        ].filter((section): section is string => section !== undefined);

        fs.writeFileSync(architecturePath, `${architectureSections.join('\n')}\n`);
    }

    const conventionNotes = [
        ...detectCiNotes(repoRoot),
        ...detectTestNotes(repoRoot)
    ];

    if (conventionNotes.length > 0) {
        const lines = [
            '# Conventions',
            '',
            'Auto-detected project conventions collected during `patchbay init`.',
            '',
            ...conventionNotes.map((note) => `- ${note}`)
        ];
        fs.writeFileSync(conventionsPath, `${lines.join('\n')}\n`);
    }
}
