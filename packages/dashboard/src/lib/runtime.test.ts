import { afterEach, describe, expect, it, vi } from 'vitest';

const createConfiguredOrchestrator = vi.fn();

vi.mock('@patchbay/server', () => ({
  createConfiguredOrchestrator,
}));

const globalForPatchbay = globalThis as typeof globalThis & {
  __patchbayDashboardOrchestrator__?: unknown;
  __patchbayDashboardOrchestratorRepoRoot__?: string;
};

describe('dashboard runtime orchestrator cache', () => {
  afterEach(() => {
    delete process.env.PATCHBAY_REPO_ROOT;
    delete globalForPatchbay.__patchbayDashboardOrchestrator__;
    delete globalForPatchbay.__patchbayDashboardOrchestratorRepoRoot__;
    createConfiguredOrchestrator.mockReset();
    vi.resetModules();
  });

  it('reuses the same orchestrator for repeated calls', async () => {
    process.env.PATCHBAY_REPO_ROOT = '/tmp/project-a';
    const orchestrator = { id: 'a' };
    createConfiguredOrchestrator.mockReturnValue(orchestrator);

    const { getOrchestrator } = await import('./runtime');

    expect(getOrchestrator()).toBe(orchestrator);
    expect(getOrchestrator()).toBe(orchestrator);
    expect(createConfiguredOrchestrator).toHaveBeenCalledTimes(1);
    expect(createConfiguredOrchestrator).toHaveBeenCalledWith('/tmp/project-a');
  });

  it('recreates the orchestrator when the repo root changes', async () => {
    process.env.PATCHBAY_REPO_ROOT = '/tmp/project-a';
    createConfiguredOrchestrator.mockReturnValueOnce({ id: 'a' });

    let runtime = await import('./runtime');
    expect(runtime.getOrchestrator()).toEqual({ id: 'a' });
    expect(createConfiguredOrchestrator).toHaveBeenCalledTimes(1);

    vi.resetModules();

    process.env.PATCHBAY_REPO_ROOT = '/tmp/project-b';
    createConfiguredOrchestrator.mockReturnValueOnce({ id: 'b' });

    runtime = await import('./runtime');
    expect(runtime.getOrchestrator()).toEqual({ id: 'b' });
    expect(createConfiguredOrchestrator).toHaveBeenCalledTimes(2);
    expect(createConfiguredOrchestrator).toHaveBeenLastCalledWith('/tmp/project-b');
  });
});
