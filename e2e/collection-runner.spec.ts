import { test, expect } from '@playwright/test';

test.describe('Collection Runner', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => localStorage.clear());

    // Seed a collection with two HTTP GETs against a known-good endpoint
    await page.evaluate(() => {
      const emptyBody = { type: 'none', raw: '', formData: [], urlencoded: [] };
      localStorage.setItem(
        'curlit_collections',
        JSON.stringify([
          {
            id: 'col-run',
            name: 'Runner Fixture',
            createdAt: 1,
            updatedAt: 1,
            requests: [
              {
                id: 'req-a', name: 'Alpha', method: 'GET',
                url: 'https://httpbin.org/get',
                params: [], headers: [], body: emptyBody,
                auth: { type: 'none' },
              },
              {
                id: 'req-b', name: 'Bravo', method: 'GET',
                url: 'https://httpbin.org/status/200',
                params: [], headers: [], body: emptyBody,
                auth: { type: 'none' },
              },
            ],
          },
        ]),
      );
    });

    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('runs all requests sequentially and summarises pass/fail', async ({ page }) => {
    // Open the collection context menu and click Run collection
    await page.getByText('Runner Fixture').hover();
    await page.locator('.group:has-text("Runner Fixture") button').filter({ has: page.locator('svg') }).last().click();
    await page.getByRole('button', { name: 'Run collection' }).click();

    // Modal is open with the collection name
    await expect(page.getByRole('heading', { name: /Run Collection — Runner Fixture/ })).toBeVisible();

    // Both request rows visible in pending state
    await expect(page.getByText('Alpha', { exact: true })).toBeVisible();
    await expect(page.getByText('Bravo', { exact: true })).toBeVisible();

    // Summary shows total of 2 before start
    await expect(page.locator('text=TOTAL').locator('..').locator('div').first()).toHaveText('2');

    // Start the run
    await page.getByRole('button', { name: /Start Run/ }).click();

    // Wait for completion (summary appears at bottom of stat card)
    await expect(page.getByText(/Completed 2\/2 in/)).toBeVisible({ timeout: 30_000 });

    // Summary: both should pass (no test scripts defined)
    const passedStat = page.locator('text=PASSED').locator('..').locator('div').first();
    await expect(passedStat).toHaveText('2');

    const erroredStat = page.locator('text=ERRORED').locator('..').locator('div').first();
    await expect(erroredStat).toHaveText('0');

    // Start Run button becomes "Run Again"
    await expect(page.getByRole('button', { name: /Run Again/ })).toBeVisible();
  });

  test('disables Run collection for an empty collection', async ({ page }) => {
    // Replace the seeded collection with an empty one
    await page.evaluate(() => {
      localStorage.setItem(
        'curlit_collections',
        JSON.stringify([
          { id: 'col-empty', name: 'Empty Col', createdAt: 1, updatedAt: 1, requests: [] },
        ]),
      );
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    await page.getByText('Empty Col').hover();
    await page.locator('.group:has-text("Empty Col") button').filter({ has: page.locator('svg') }).last().click();
    const runItem = page.getByRole('button', { name: 'Run collection' });
    await expect(runItem).toBeDisabled();
  });
});
