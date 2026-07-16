import { test, expect } from '@playwright/test';

test.describe('Collections', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('create collection via + button', async ({ page }) => {
    await page.locator('button[title="New collection"]').click();
    const dialog = page.getByRole('dialog', { name: 'New Collection' });
    await dialog.getByRole('textbox', { name: 'Collection name' }).fill('Test API');
    await dialog.getByRole('button', { name: 'Create' }).click();

    // Verify collection appears in sidebar
    await expect(page.getByText('Test API', { exact: true })).toBeVisible();
  });
});
