import { test, expect } from '@playwright/test';

test.describe('Share Request Links', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('generate a share link, open it, and see the request restored', async ({ page }) => {
    // ─── Configure the active request ──────────────────────────────────────
    const urlInput = page.locator('input[placeholder*="Enter URL"]');
    await urlInput.fill('https://api.example.com/shared');

    // ─── Open Share modal ──────────────────────────────────────────────────
    await page.locator('button[title="Share request as a link"]').click();
    await expect(page.getByRole('heading', { name: 'Share Request' })).toBeVisible();

    // ─── Grab the generated link ───────────────────────────────────────────
    const linkTextarea = page.locator('textarea[readonly]');
    const shareUrl = await linkTextarea.inputValue();
    expect(shareUrl).toMatch(/#share=[A-Za-z0-9_-]+$/);

    // ─── Visit the link ────────────────────────────────────────────────────
    await page.goto(shareUrl);
    await page.waitForLoadState('networkidle');

    // URL bar of the newly opened tab should contain the shared URL
    const restoredUrl = page.locator('input[placeholder*="Enter URL"]');
    await expect(restoredUrl).toHaveValue('https://api.example.com/shared');

    // Hash should be cleared after import so refresh doesn't re-import
    await expect.poll(async () => page.evaluate(() => window.location.hash)).toBe('');
  });

  test('secrets are stripped by default, included when toggle is enabled', async ({ page }) => {
    const urlInput = page.locator('input[placeholder*="Enter URL"]');
    await urlInput.fill('https://api.example.com/secure');

    // Navigate to the Auth tab and set a bearer token
    await page.getByRole('button', { name: 'Auth', exact: true }).click();
    await page.getByRole('button', { name: 'Bearer Token', exact: true }).click();
    await page.locator('input[placeholder="Enter bearer token"]').fill('super-secret-token');

    // Open the share modal
    await page.locator('button[title="Share request as a link"]').click();

    const decodeFn = (enc: string) => {
      const pad = '='.repeat((4 - (enc.length % 4)) % 4);
      const b64 = enc.replace(/-/g, '+').replace(/_/g, '/') + pad;
      return JSON.parse(atob(b64));
    };

    // Default: toggle is off → no secret in the encoded link
    const linkTextarea = page.locator('textarea[readonly]');
    const defaultUrl = await linkTextarea.inputValue();
    const defaultPayload = await page.evaluate(decodeFn, defaultUrl.split('#share=')[1]);
    expect(defaultPayload.request.auth.type).toBe('none');
    expect(defaultPayload.includesSecrets).toBe(false);

    // Enable include secrets
    await page.getByRole('checkbox').check();
    await expect(page.getByText(/contains credentials and executable scripts/)).toBeVisible();

    // The link now carries the bearer token
    const secretUrl = await linkTextarea.inputValue();
    const secretPayload = await page.evaluate(decodeFn, secretUrl.split('#share=')[1]);
    expect(secretPayload.request.auth.type).toBe('bearer');
    expect(secretPayload.request.auth.bearer.token).toBe('super-secret-token');
    expect(secretPayload.includesSecrets).toBe(true);
  });
});
