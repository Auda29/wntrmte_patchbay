import { createConfiguredOrchestrator } from '@patchbay/server';
import type { Orchestrator } from '@patchbay/core';
import { REPO_ROOT } from './store';

let orchestrator: Orchestrator | null = null;

export function getOrchestrator(): Orchestrator {
  if (!orchestrator) {
    orchestrator = createConfiguredOrchestrator(REPO_ROOT);
  }

  return orchestrator;
}
