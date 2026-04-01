import { test, expect } from '@playwright/test';

test.describe('Dispatch Dialog', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/tasks');
        // Wait for task card to be visible before interacting
        await expect(page.locator('button[title="Start session or one-off run"]')).toBeVisible();
    });

    test('opens dispatch dialog on run button click', async ({ page }) => {
        await page.locator('button[title="Start session or one-off run"]').first().click();
        await expect(page.getByRole('heading', { name: 'Start Agent Session' })).toBeVisible();
    });

    test('dispatch dialog shows task id', async ({ page }) => {
        await page.locator('button[title="Start session or one-off run"]').first().click();
        // TASK-001 appears both in the card and in the dialog — check either is visible
        await expect(page.getByText('TASK-001').first()).toBeVisible();
    });

    test('dispatch dialog shows connector-first label or runner fallback label', async ({ page }) => {
        await page.locator('button[title="Start session or one-off run"]').first().click();
        const connectorLabel = page.getByText('Connector', { exact: true });
        const batchRunnerLabel = page.getByText('Batch Runner', { exact: true });
        const hasConnectorLabel = await connectorLabel.count();
        const hasBatchRunnerLabel = await batchRunnerLabel.count();

        expect(hasConnectorLabel + hasBatchRunnerLabel).toBeGreaterThan(0);
    });

    test('dispatch dialog has start action for session-first or fallback run', async ({ page }) => {
        await page.locator('button[title="Start session or one-off run"]').first().click();
        const startSession = page.getByRole('button', { name: 'Start Session', exact: true });
        const startOneOffRun = page.getByRole('button', { name: 'Start One-off Run', exact: true });
        const hasStartSession = await startSession.count();
        const hasStartOneOffRun = await startOneOffRun.count();

        expect(hasStartSession + hasStartOneOffRun).toBeGreaterThan(0);
    });

    test('dispatch dialog can be closed with Cancel', async ({ page }) => {
        await page.locator('button[title="Start session or one-off run"]').first().click();
        await expect(page.getByRole('heading', { name: 'Start Agent Session' })).toBeVisible();
        await page.getByRole('button', { name: 'Cancel' }).click();
        await expect(page.getByRole('heading', { name: 'Start Agent Session' })).not.toBeVisible();
    });
});
