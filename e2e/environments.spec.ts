import { test, expect } from '@playwright/test';

test.describe('Environments', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('create environment and see it in sidebar', async ({ page }) => {
    // Navigate to Environments tab
    await page.locator('button[title="Environments"]').click();

    await page.locator('button[title="New environment"]').click();
    const dialog = page.getByRole('dialog', { name: 'New Environment' });
    await dialog.getByRole('textbox', { name: 'Environment name' }).fill('Production');
    await dialog.getByRole('button', { name: 'Create' }).click();

    // Verify environment appears
    await expect(page.getByText('Production')).toBeVisible();
  });
});
