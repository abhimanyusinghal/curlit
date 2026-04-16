import { test, expect } from '@playwright/test';

test.describe('Cloud Sync (GitHub Gist)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('shows unconfigured state when the proxy lacks GITHUB_CLIENT_ID', async ({ page }) => {
    await page.route('**/api/github/status', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"configured":false}' })
    );

    await page.locator('button[title="Cloud sync via GitHub Gist"]').click();
    await expect(page.getByRole('heading', { name: 'Cloud Sync' })).toBeVisible();
    await expect(page.getByText(/not configured on this CurlIt instance/)).toBeVisible();
  });

  test('sign-in completes via the stubbed device flow', async ({ page }) => {
    // Status: configured
    await page.route('**/api/github/status', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"configured":true}' })
    );

    // Device code endpoint
    await page.route('**/api/github/device-code', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          device_code: 'dc-xyz',
          user_code: 'ABCD-1234',
          verification_uri: 'https://github.com/login/device',
          interval: 1,
          expires_in: 900,
        }),
      })
    );

    // Token poll: return pending once, then access_token
    let pollCount = 0;
    await page.route('**/api/github/device-token', route => {
      pollCount++;
      const body =
        pollCount === 1
          ? JSON.stringify({ error: 'authorization_pending' })
          : JSON.stringify({ access_token: 'ghs_test_token', token_type: 'bearer', scope: 'gist' });
      route.fulfill({ status: 200, contentType: 'application/json', body });
    });

    // GitHub /user — called after token is stored to fetch username
    await page.route('**/api.github.com/user', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ login: 'octocat' }),
      })
    );

    await page.locator('button[title="Cloud sync via GitHub Gist"]').click();

    // Signed-out state → click Sign in
    await page.getByRole('button', { name: /Sign in with GitHub/ }).click();

    // Device code panel appears
    await expect(page.getByText('ABCD-1234')).toBeVisible();

    // After pending + success polls, the signed-in state should appear
    await expect(page.getByText(/Connected as/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('@octocat')).toBeVisible();

    // Token was persisted
    const stored = await page.evaluate(() => localStorage.getItem('curlit_sync_token'));
    expect(stored).toContain('ghs_test_token');

    // At least 2 polls happened (pending then ok)
    expect(pollCount).toBeGreaterThanOrEqual(2);
  });

  test('sign-out clears the local sync token', async ({ page }) => {
    // Seed a token so we start in signed-in state
    await page.evaluate(() => localStorage.setItem('curlit_sync_token', JSON.stringify('ghs_seed')));
    await page.route('**/api/github/status', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"configured":true}' })
    );
    await page.route('**/api.github.com/user', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ login: 'seeded-user' }),
      })
    );
    await page.reload();
    await page.waitForLoadState('networkidle');

    await page.locator('button[title="Cloud sync via GitHub Gist"]').click();
    await expect(page.getByText('@seeded-user')).toBeVisible();

    await page.getByRole('button', { name: /Sign out/ }).click();
    await expect(page.getByRole('button', { name: /Sign in with GitHub/ })).toBeVisible();

    const stored = await page.evaluate(() => localStorage.getItem('curlit_sync_token'));
    expect(stored === null || stored === 'null').toBe(true);
  });
});
