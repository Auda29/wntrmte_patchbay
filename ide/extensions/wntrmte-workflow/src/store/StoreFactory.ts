import * as vscode from 'vscode';
import { PatchbayStore } from './PatchbayStore';
import { FileStore } from './FileStore';
import { ApiStore } from './ApiStore';
import { probeDashboard } from '../services/SetupInspector';

export type StoreMode = 'auto' | 'offline' | 'connected';

export interface StoreResult {
  store: PatchbayStore;
  mode: 'offline' | 'connected';
}

export async function createStore(
  workspaceRoot: string,
  agentsDirName: string
): Promise<StoreResult> {
  const config = vscode.workspace.getConfiguration('wntrmte.workflow');
  const mode = config.get<StoreMode>('mode', 'auto');
  const dashboardUrl = config.get<string>('dashboardUrl', 'http://localhost:3000');

  if (mode === 'offline') {
    return { store: new FileStore(workspaceRoot, agentsDirName), mode: 'offline' };
  }

  if (mode === 'connected') {
    return { store: new ApiStore(dashboardUrl), mode: 'connected' };
  }

  // auto: probe dashboard
  const dashboard = await probeDashboard(dashboardUrl);
  if (dashboard.reachable) {
    return { store: new ApiStore(dashboardUrl), mode: 'connected' };
  }
  return { store: new FileStore(workspaceRoot, agentsDirName), mode: 'offline' };
}
