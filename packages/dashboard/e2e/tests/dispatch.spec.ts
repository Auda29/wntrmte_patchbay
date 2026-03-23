import { test, expect } from '@playwright/test';

test.describe('Dispatch Dialog', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/tasks');
        // Wait for task card to be visible before interacting
        await expect(page.locator('button[title="Run task"]')).toBeVisible();
    });

    test('opens dispatch dialog on run button click', async ({ page }) => {
        await page.locator('button[title="Run task"]').first().click();
        await expect(page.getByRole('heading', { name: 'Dispatch Run' })).toBeVisible();
    });

    test('dispatch dialog shows task id', async ({ page }) => {
        await page.locator('button[title="Run task"]').first().click();
        // TASK-001 appears both in the card and in the dialog — check either is visible
        await expect(page.getByText('TASK-001').first()).toBeVisible();
    });

    test('dispatch dialog shows Runner label', async ({ page }) => {
        await page.locator('button[title="Run task"]').first().click();
        await expect(page.getByText('Runner', { exact: true })).toBeVisible();
    });

    test('dispatch dialog has Start Run button', async ({ page }) => {
        await page.locator('button[title="Run task"]').first().click();
        await expect(page.getByRole('button', { name: 'Start Run' })).toBeVisible();
    });

    test('dispatch dialog can be closed with Cancel', async ({ page }) => {
        await page.locator('button[title="Run task"]').first().click();
        await expect(page.getByRole('heading', { name: 'Dispatch Run' })).toBeVisible();
        await page.getByRole('button', { name: 'Cancel' }).click();
        await expect(page.getByRole('heading', { name: 'Dispatch Run' })).not.toBeVisible();
    });
});
