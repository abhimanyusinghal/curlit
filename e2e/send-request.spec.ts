import { test, expect } from '@playwright/test';

test.describe('Send Request', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('type URL, click Send, and see response', async ({ page }) => {
    // Type URL
    const urlInput = page.locator('input[placeholder*="Enter URL"]');
    await urlInput.fill('https://httpbin.org/get');

    // Click Send
    await page.click('button:has-text("Send")');

    // Wait for response - should show status code
    await expect(page.locator('text=/200/')).toBeVisible({ timeout: 15000 });
  });

  test('change HTTP method persists in dropdown', async ({ page }) => {
    const select = page.locator('select');
    await select.selectOption('POST');
    await expect(select).toHaveValue('POST');
  });

  test('Send button is disabled when URL is empty', async ({ page }) => {
    const sendBtn = page.locator('button:has-text("Send")');
    await expect(sendBtn).toBeDisabled();
  });

  test('Enter a URL and see empty state disappears after send', async ({ page }) => {
    // Should see empty state initially
    await expect(page.locator('text=Enter a URL and click Send')).toBeVisible();

    // Type URL and send
    const urlInput = page.locator('input[placeholder*="Enter URL"]');
    await urlInput.fill('https://httpbin.org/get');
    await page.click('button:has-text("Send")');

    // Empty state should disappear
    await expect(page.locator('text=Enter a URL and click Send')).not.toBeVisible({ timeout: 15000 });
  });
});
