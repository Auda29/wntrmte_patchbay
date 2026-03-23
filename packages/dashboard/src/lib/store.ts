import { Store } from '@patchbay/core';
import * as path from 'path';

// For development, point to the root of the patchbay monorepo where we initialized .project-agents
export const REPO_ROOT = process.env.PATCHBAY_REPO_ROOT || path.resolve(process.cwd(), '../..');

export const getStore = () => {
    return new Store(REPO_ROOT);
};
