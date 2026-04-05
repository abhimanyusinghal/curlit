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
    // Click the "New collection" button (has title attribute)
    page.on('dialog', async dialog => {
      await dialog.accept('Test API');
    });
    await page.locator('button[title="New collection"]').click();

    // Verify collection appears in sidebar
    await expect(page.locator('text=Test API')).toBeVisible();
  });
});
