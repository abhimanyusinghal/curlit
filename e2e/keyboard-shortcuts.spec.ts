import { test, expect } from '@playwright/test';

test.describe('Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Ctrl+N creates a new tab', async ({ page }) => {
    // Count initial tabs
    const initialTabs = await page.locator('[class*="min-w-"]').count();
    await page.keyboard.press('Control+n');
    // Should have one more tab
    const newTabs = await page.locator('[class*="min-w-"]').count();
    expect(newTabs).toBe(initialTabs + 1);
  });

  test('Ctrl+B toggles sidebar', async ({ page }) => {
    // Sidebar should be visible initially - use a unique element in the sidebar
    const sidebar = page.getByText('No collections yet', { exact: false });
    await expect(sidebar).toBeVisible();
    // Toggle off
    await page.keyboard.press('Control+b');
    await expect(sidebar).not.toBeVisible();
    // Toggle back on
    await page.keyboard.press('Control+b');
    await expect(sidebar).toBeVisible();
  });

  test('Ctrl+I opens import modal', async ({ page }) => {
    await page.keyboard.press('Control+i');
    await expect(page.getByRole('heading', { name: 'Import cURL' })).toBeVisible();
  });

  test('Ctrl+D duplicates the active request', async ({ page }) => {
    const initialTabs = await page.locator('[class*="min-w-"]').count();
    await page.keyboard.press('Control+d');
    const newTabs = await page.locator('[class*="min-w-"]').count();
    expect(newTabs).toBe(initialTabs + 1);
  });

  test('Ctrl+E opens export modal', async ({ page }) => {
    await page.keyboard.press('Control+e');
    await expect(page.locator('text=cURL Export')).toBeVisible();
  });
});
