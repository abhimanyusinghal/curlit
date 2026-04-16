import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test.describe('Backup / Restore', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('export downloads a valid backup, import restores it', async ({ page }) => {
    // ─── Seed state directly in localStorage ───────────────────────────────
    await page.evaluate(() => {
      localStorage.setItem(
        'curlit_collections',
        JSON.stringify([
          {
            id: 'col-1',
            name: 'Seeded Collection',
            requests: [
              {
                id: 'req-1',
                name: 'Seeded Request',
                method: 'GET',
                url: 'https://api.example.com/users',
                params: [],
                headers: [],
                body: { type: 'none', raw: '', formData: [], urlencoded: [] },
                auth: { type: 'none' },
              },
            ],
            createdAt: 1,
            updatedAt: 1,
          },
        ])
      );
      localStorage.setItem(
        'curlit_environments',
        JSON.stringify([
          {
            id: 'env-1',
            name: 'Seeded Env',
            variables: [{ id: 'v1', key: 'host', value: 'api.test', enabled: true }],
            isActive: false,
          },
        ])
      );
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Sanity: seeded collection is visible in sidebar
    await expect(page.getByText('Seeded Collection')).toBeVisible();

    // ─── Open Backup modal and download ────────────────────────────────────
    await page.locator('button[title="Backup & Restore all data"]').click();
    await expect(page.getByRole('heading', { name: 'Backup & Restore' })).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.locator('button:has-text("Download Backup")').click();
    const download = await downloadPromise;

    // File name should match the documented pattern
    expect(download.suggestedFilename()).toMatch(/^curlit-backup-\d{4}-\d{2}-\d{2}\.json$/);

    const downloadPath = await download.path();
    const contents = fs.readFileSync(downloadPath, 'utf-8');
    const backup = JSON.parse(contents);

    // ─── Validate backup shape ─────────────────────────────────────────────
    expect(backup.curlit_backup_version).toBe(1);
    expect(backup.data.collections).toHaveLength(1);
    expect(backup.data.collections[0].name).toBe('Seeded Collection');
    expect(backup.data.collections[0].requests[0].url).toBe('https://api.example.com/users');
    expect(backup.data.environments).toHaveLength(1);
    expect(backup.data.environments[0].name).toBe('Seeded Env');

    // Close modal
    await page.locator('.fixed button:has-text("Close")').click();

    // ─── Wipe state and import via Replace mode ────────────────────────────
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Confirm data was wiped
    await expect(page.getByText('Seeded Collection')).not.toBeVisible();

    // Open Backup modal → Import tab
    await page.locator('button[title="Backup & Restore all data"]').click();
    await page.locator('.fixed button:has-text("Import")').first().click();

    // Paste backup JSON into the textarea
    await page.locator('textarea[placeholder*="CurlIt backup"]').fill(contents);

    // Validate (shows the preview panel)
    await page.locator('button:has-text("Validate")').click();
    await expect(page.getByText('Backup contents:')).toBeVisible();

    // Switch to Replace mode and confirm the dialog
    page.on('dialog', dialog => dialog.accept());
    await page.locator('button:has-text("Replace"):has-text("Overwrite")').click();
    await page.locator('button:has-text("Replace All")').click();

    // Modal should close
    await expect(page.getByRole('heading', { name: 'Backup & Restore' })).not.toBeVisible();

    // ─── Verify state was restored ─────────────────────────────────────────
    await expect(page.getByText('Seeded Collection')).toBeVisible();

    // Environments tab should also have the seeded env
    await page.locator('button[title="Environments"]').click();
    await expect(page.getByText('Seeded Env')).toBeVisible();
  });

  test('invalid JSON shows an error on Validate', async ({ page }) => {
    await page.locator('button[title="Backup & Restore all data"]').click();
    await page.locator('.fixed button:has-text("Import")').first().click();

    await page.locator('textarea[placeholder*="CurlIt backup"]').fill('{"not":"a backup"}');
    await page.locator('button:has-text("Validate")').click();

    await expect(page.getByText(/valid CurlIt backup/)).toBeVisible();
  });
});
