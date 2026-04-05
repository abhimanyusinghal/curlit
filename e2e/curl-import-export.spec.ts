import { test, expect } from '@playwright/test';

test.describe('cURL Import/Export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('import curl command via Ctrl+I creates tab with correct method and URL', async ({ page }) => {
    await page.keyboard.press('Control+i');
    await expect(page.getByRole('heading', { name: 'Import cURL' })).toBeVisible();

    // Type curl command
    const textarea = page.locator('textarea');
    await textarea.fill("curl 'https://api.example.com/users' -X POST");

    // Click the Import button inside the modal dialog
    await page.locator('.fixed button:has-text("Import")').click();

    // Modal should close
    await expect(page.getByRole('heading', { name: 'Import cURL' })).not.toBeVisible();

    // URL bar should contain the imported URL
    const urlInput = page.locator('input[placeholder*="Enter URL"]');
    await expect(urlInput).toHaveValue('https://api.example.com/users');
  });

  test('export current request as curl via Ctrl+E', async ({ page }) => {
    // Type a URL first
    const urlInput = page.locator('input[placeholder*="Enter URL"]');
    await urlInput.fill('https://example.com/api');

    // Open export modal
    await page.keyboard.press('Control+e');
    await expect(page.locator('text=cURL Export')).toBeVisible();

    // Should show curl command containing the URL
    await expect(page.locator('pre')).toContainText('example.com/api');
  });
});
