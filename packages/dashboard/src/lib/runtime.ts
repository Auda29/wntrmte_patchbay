import { createConfiguredOrchestrator } from '@patchbay/server';
import type { Orchestrator } from '@patchbay/core';
import { REPO_ROOT } from './store';

const globalForPatchbay = globalThis as typeof globalThis & {
  __patchbayDashboardOrchestrator__?: Orchestrator;
  __patchbayDashboardOrchestratorRepoRoot__?: string;
};

export function getOrchestrator(): Orchestrator {
  // Keep interactive sessions alive across Next.js dev reloads.
  if (
    !globalForPatchbay.__patchbayDashboardOrchestrator__
    || globalForPatchbay.__patchbayDashboardOrchestratorRepoRoot__ !== REPO_ROOT
  ) {
    globalForPatchbay.__patchbayDashboardOrchestrator__ = createConfiguredOrchestrator(REPO_ROOT);
    globalForPatchbay.__patchbayDashboardOrchestratorRepoRoot__ = REPO_ROOT;
  }

  return globalForPatchbay.__patchbayDashboardOrchestrator__;
}
