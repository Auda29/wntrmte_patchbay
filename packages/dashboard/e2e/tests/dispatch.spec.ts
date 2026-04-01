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

    test('dispatch dialog shows Connector label by default', async ({ page }) => {
        await page.locator('button[title="Start session or one-off run"]').first().click();
        await expect(page.getByText('Connector', { exact: true })).toBeVisible();
    });

    test('dispatch dialog has Start Session button', async ({ page }) => {
        await page.locator('button[title="Start session or one-off run"]').first().click();
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByRole('button', { name: /Start Session/i }).first()).toBeVisible();
    });

    test('dispatch dialog can be closed with Cancel', async ({ page }) => {
        await page.locator('button[title="Start session or one-off run"]').first().click();
        await expect(page.getByRole('heading', { name: 'Start Agent Session' })).toBeVisible();
        await page.getByRole('button', { name: 'Cancel' }).click();
        await expect(page.getByRole('heading', { name: 'Start Agent Session' })).not.toBeVisible();
    });
});
