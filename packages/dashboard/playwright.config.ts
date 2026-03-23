import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

const fixtureDir = path.resolve(__dirname, 'e2e/fixtures');

export default defineConfig({
    testDir: 'e2e/tests',
    timeout: 30_000,
    retries: process.env.CI ? 1 : 0,
    use: {
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
        env: {
            PATCHBAY_REPO_ROOT: fixtureDir,
        },
    },
});
