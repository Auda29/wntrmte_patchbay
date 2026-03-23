import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileStore } from './FileStore';
import type { Run } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'filestore-test-'));
}

async function makeWorkspace(root: string): Promise<string> {
  const agentsDir = path.join(root, '.project-agents');
  await fs.mkdir(path.join(agentsDir, 'tasks'), { recursive: true });
  await fs.mkdir(path.join(agentsDir, 'runs'), { recursive: true });
  return agentsDir;
}

function makeTaskMd(id: string, title: string, status = 'open'): string {
  return `---\nid: ${id}\ntitle: ${title}\nstatus: ${status}\nowner: test\naffectedFiles: []\n---\n\nTask body.`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FileStore', () => {
  let tmpDir: string;
  let store: FileStore;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    await makeWorkspace(tmpDir);
    store = new FileStore(tmpDir, '.project-agents');
  });

  afterEach(async () => {
    store.dispose();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // --- getTasks ---

  it('getTasks() returns [] when tasks dir is missing', async () => {
    const emptyRoot = await makeTmpDir();
    const emptyStore = new FileStore(emptyRoot, '.project-agents');
    try {
      const tasks = await emptyStore.getTasks();
      expect(tasks).toEqual([]);
    } finally {
      emptyStore.dispose();
      await fs.rm(emptyRoot, { recursive: true, force: true });
    }
  });

  it('getTasks() parses frontmatter correctly', async () => {
    const tasksDir = path.join(tmpDir, '.project-agents', 'tasks');
    await fs.writeFile(path.join(tasksDir, 'task-001.md'), makeTaskMd('task-001', 'First task'));

    const tasks = await store.getTasks();

    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('task-001');
    expect(tasks[0].title).toBe('First task');
    expect(tasks[0].status).toBe('open');
    expect(tasks[0].body).toContain('Task body.');
  });

  it('getTasks() sorts by id', async () => {
    const tasksDir = path.join(tmpDir, '.project-agents', 'tasks');
    await fs.writeFile(path.join(tasksDir, 'task-003.md'), makeTaskMd('task-003', 'Third'));
    await fs.writeFile(path.join(tasksDir, 'task-001.md'), makeTaskMd('task-001', 'First'));
    await fs.writeFile(path.join(tasksDir, 'task-002.md'), makeTaskMd('task-002', 'Second'));

    const tasks = await store.getTasks();

    expect(tasks.map(t => t.id)).toEqual(['task-001', 'task-002', 'task-003']);
  });

  it('getTasks() ignores non-.md files', async () => {
    const tasksDir = path.join(tmpDir, '.project-agents', 'tasks');
    await fs.writeFile(path.join(tasksDir, 'task-001.md'), makeTaskMd('task-001', 'Valid'));
    await fs.writeFile(path.join(tasksDir, 'notes.txt'), 'not a task');

    const tasks = await store.getTasks();
    expect(tasks).toHaveLength(1);
  });

  // --- getRuns ---

  it('getRuns() returns [] when runs dir is missing', async () => {
    const emptyRoot = await makeTmpDir();
    const emptyStore = new FileStore(emptyRoot, '.project-agents');
    try {
      const runs = await emptyStore.getRuns('task-001');
      expect(runs).toEqual([]);
    } finally {
      emptyStore.dispose();
      await fs.rm(emptyRoot, { recursive: true, force: true });
    }
  });

  it('getRuns() returns only runs for the requested taskId', async () => {
    const runsDir = path.join(tmpDir, '.project-agents', 'runs');
    const run1 = { id: 'run-001', taskId: 'task-001', runner: 'claude-code', startTime: '2025-01-01T00:00:00Z', status: 'completed' };
    const run2 = { id: 'run-002', taskId: 'task-002', runner: 'claude-code', startTime: '2025-01-02T00:00:00Z', status: 'completed' };
    await fs.writeFile(path.join(runsDir, 'run-001.json'), JSON.stringify(run1));
    await fs.writeFile(path.join(runsDir, 'run-002.json'), JSON.stringify(run2));

    const runs = await store.getRuns('task-001');

    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe('run-001');
  });

  it('getRuns() skips malformed JSON files', async () => {
    const runsDir = path.join(tmpDir, '.project-agents', 'runs');
    await fs.writeFile(path.join(runsDir, 'bad.json'), 'not json {{');

    const runs = await store.getRuns('task-001');
    expect(runs).toEqual([]);
  });

  // --- updateTaskStatus ---

  it('updateTaskStatus() updates the status field in the file', async () => {
    const tasksDir = path.join(tmpDir, '.project-agents', 'tasks');
    const filePath = path.join(tasksDir, 'task-001.md');
    await fs.writeFile(filePath, makeTaskMd('task-001', 'My task', 'open'));

    await store.updateTaskStatus('task-001', 'in_progress');

    const updated = await fs.readFile(filePath, 'utf-8');
    expect(updated).toContain('status: in_progress');
    expect(updated).not.toContain('status: open');
  });

  it('updateTaskStatus() throws when task is not found', async () => {
    await expect(store.updateTaskStatus('nonexistent', 'done')).rejects.toThrow('Task nonexistent not found');
  });

  // --- saveRun ---

  it('saveRun() writes a JSON file to the runs dir', async () => {
    const run: Run = {
      id: 'run-abc',
      taskId: 'task-001',
      runner: 'claude-code',
      startTime: '2025-01-01T00:00:00Z',
      status: 'completed',
      filePath: '',
    };

    await store.saveRun(run);

    const filePath = path.join(tmpDir, '.project-agents', 'runs', 'run-abc.json');
    expect(fsSync.existsSync(filePath)).toBe(true);
    const saved = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    expect(saved.id).toBe('run-abc');
    expect(saved.taskId).toBe('task-001');
    expect(saved.filePath).toBeUndefined();
  });

  // --- getProject ---

  it('getProject() returns undefined when project.yml is missing', async () => {
    const project = await store.getProject();
    expect(project).toBeUndefined();
  });

  it('getProject() parses project.yml correctly', async () => {
    const yml = 'name: My Project\ngoal: Build something great\ntechStack:\n  - TypeScript\n';
    await fs.writeFile(path.join(tmpDir, '.project-agents', 'project.yml'), yml);

    const project = await store.getProject();

    expect(project?.name).toBe('My Project');
    expect(project?.goal).toBe('Build something great');
    expect(project?.techStack).toContain('TypeScript');
  });
});
