import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

// Node.js exec has util.promisify.custom set on it, so promisify(exec) resolves
// with { stdout, stderr } — not just stdout. To make our mocked exec behave the
// same way we attach the custom symbol to the mock function before the module
// under test is imported.
// NOTE: vi.mock() is hoisted, so PROMISIFY_CUSTOM cannot be referenced from the
// outer scope inside the factory — we inline Symbol.for() directly.
vi.mock('child_process', () => {
  const sym = Symbol.for('nodejs.util.promisify.custom');
  const customFn = vi.fn();
  const execMock = vi.fn();
  (execMock as Record<symbol, unknown>)[sym] = customFn;
  return { exec: execMock, execFile: vi.fn(), spawn: vi.fn() };
});

const PROMISIFY_CUSTOM = Symbol.for('nodejs.util.promisify.custom');

// Import after the mock is set up.
import { exec } from 'child_process';
import { isWorkspaceComplete, checkPatchbayCli, detectProjectInitMeta } from './SetupInspector';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCustomFn(): ReturnType<typeof vi.fn> {
  return (exec as Record<symbol, ReturnType<typeof vi.fn>>)[PROMISIFY_CUSTOM];
}

function stubExecSuccess(stdout: string, stderr = ''): void {
  getCustomFn().mockResolvedValue({ stdout, stderr });
}

function stubExecFailure(message: string): void {
  getCustomFn().mockRejectedValue(new Error(message));
}

// ---------------------------------------------------------------------------
// isWorkspaceComplete
// ---------------------------------------------------------------------------

describe('isWorkspaceComplete()', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'setup-inspector-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns false when .project-agents dir is missing entirely', () => {
    expect(isWorkspaceComplete(tmpDir, '.project-agents')).toBe(false);
  });

  it('returns false when only some subdirs exist', async () => {
    const base = path.join(tmpDir, '.project-agents');
    await fs.mkdir(path.join(base, 'agents'), { recursive: true });
    // decisions and context are absent

    expect(isWorkspaceComplete(tmpDir, '.project-agents')).toBe(false);
  });

  it('returns true when agents, decisions, and context all exist', async () => {
    const base = path.join(tmpDir, '.project-agents');
    await fs.mkdir(path.join(base, 'agents'), { recursive: true });
    await fs.mkdir(path.join(base, 'decisions'), { recursive: true });
    await fs.mkdir(path.join(base, 'context'), { recursive: true });

    expect(isWorkspaceComplete(tmpDir, '.project-agents')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// detectProjectInitMeta
// ---------------------------------------------------------------------------

describe('detectProjectInitMeta()', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'setup-inspector-meta-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('detects package.json metadata and JavaScript ecosystem tech stack', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'detected-repo',
        description: 'Auto-detected goal',
        dependencies: {
          react: '^19.0.0',
          next: '^15.0.0',
        },
        devDependencies: {
          typescript: '^5.0.0',
          tailwindcss: '^4.0.0',
        },
      }, null, 2),
      'utf8',
    );

    const result = detectProjectInitMeta(tmpDir);

    expect(result.name).toBe('detected-repo');
    expect(result.goal).toBe('Auto-detected goal');
    expect(result.techStack).toEqual(['Node.js', 'TypeScript', 'Next.js', 'React', 'Tailwind CSS']);
  });

  it('falls back to repository basename and default goal when metadata is missing', () => {
    const result = detectProjectInitMeta(tmpDir);

    expect(result.name).toBe(path.basename(tmpDir));
    expect(result.goal).toBe('To build awesome software');
    expect(result.techStack).toEqual([]);
  });

  it('detects Python, Rust, and Go repos from language-specific files', async () => {
    await fs.writeFile(path.join(tmpDir, 'pyproject.toml'), 'name = "py-repo"\ndescription = "Ship tools"\n', 'utf8');
    await fs.writeFile(path.join(tmpDir, 'Cargo.toml'), '[package]\nname = "rusty"\ndescription = "Rust tools"\n', 'utf8');
    await fs.writeFile(path.join(tmpDir, 'go.mod'), 'module github.com/acme/go-repo\n', 'utf8');

    const result = detectProjectInitMeta(tmpDir);

    expect(result.name).toBe('py-repo');
    expect(result.goal).toBe('Ship tools');
    expect(result.techStack).toEqual(['Python', 'Rust', 'Go']);
  });
});

// ---------------------------------------------------------------------------
// checkPatchbayCli
// ---------------------------------------------------------------------------

describe('checkPatchbayCli()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns available: false when exec throws', async () => {
    stubExecFailure('spawn patchbay ENOENT');

    const result = await checkPatchbayCli();

    expect(result.available).toBe(false);
    expect(result.error).toContain('ENOENT');
  });

  it('returns available: true with version from stdout', async () => {
    stubExecSuccess('patchbay 1.2.3');

    const result = await checkPatchbayCli();

    expect(result.available).toBe(true);
    expect(result.version).toBe('patchbay 1.2.3');
  });

  it('returns available: true with version from stderr when stdout is empty', async () => {
    stubExecSuccess('', 'patchbay 0.9.0');

    const result = await checkPatchbayCli();

    expect(result.available).toBe(true);
    expect(result.version).toBe('patchbay 0.9.0');
  });

  it('falls back to "patchbay" when both stdout and stderr are empty', async () => {
    stubExecSuccess('', '');

    const result = await checkPatchbayCli();

    expect(result.available).toBe(true);
    expect(result.version).toBe('patchbay');
  });

  it('passes cwd option when provided', async () => {
    stubExecSuccess('patchbay 1.0.0');

    await checkPatchbayCli('/some/workspace');

    expect(getCustomFn()).toHaveBeenCalledWith(
      'patchbay --version',
      { cwd: '/some/workspace' },
    );
  });

  it('passes undefined as options when no cwd is provided', async () => {
    stubExecSuccess('patchbay 1.0.0');

    await checkPatchbayCli();

    expect(getCustomFn()).toHaveBeenCalledWith('patchbay --version', undefined);
  });
});
