import { test, expect } from '@playwright/test';

test.describe('Task Board', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/tasks');
    });

    test('renders the Task Board heading', async ({ page }) => {
        await expect(page.getByRole('heading', { name: 'Task Board' })).toBeVisible();
    });

    test('shows fixture task title', async ({ page }) => {
        await expect(page.getByText('Write unit tests')).toBeVisible();
    });

    test('shows fixture task id', async ({ page }) => {
        await expect(page.getByText('TASK-001')).toBeVisible();
    });

    test('shows Open column with task count', async ({ page }) => {
        await expect(page.getByText('Open')).toBeVisible();
    });

    test('shows dispatch button for open tasks', async ({ page }) => {
        await expect(page.locator('button[title="Run task"]')).toBeVisible();
    });

    test('shows New Task button', async ({ page }) => {
        await expect(page.getByRole('button', { name: 'New Task' })).toBeVisible();
    });
});
