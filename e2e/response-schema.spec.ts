import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const schema = JSON.stringify({ type: 'object', required: ['id'], properties: { id: { type: 'integer' } } });

async function collectionMenu(page: Page) {
  await page.getByText('Schema suite', { exact: true }).hover();
  await page.locator('.group:has-text("Schema suite") button').last().click();
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/proxy', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ status: 200, statusText: 'OK', headers: {}, body: '{"id":"wrong"}', cookies: [], time: 1, size: 14 }),
  }));
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('curlit_collections', JSON.stringify([{
      id: 'schema-suite', name: 'Schema suite', createdAt: 1, updatedAt: 1,
      requests: [{
        id: 'schema-request', name: 'Schema request', method: 'GET', url: 'https://example.test/user',
        headers: [], params: [], body: { type: 'none', raw: '', formData: [], urlencoded: [] }, auth: { type: 'none' },
      }],
    }]));
  });
  await page.reload();
  await page.getByText('Schema suite', { exact: true }).click();
  await page.getByRole('button', { name: 'GET Schema request', exact: true }).click();
  await page.getByRole('button', { name: 'Schema', exact: true }).click();
});

test('validates in a real browser worker and can retain a disabled invalid draft', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Response schema JSON' });
  await page.getByRole('button', { name: 'Insert example' }).click();
  await expect(editor).toContainText('draft-07');
  await editor.fill(schema);
  await page.getByRole('checkbox', { name: 'Validate response against schema' }).check();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('button', { name: /Tests/ }).click();
  await expect(page.getByText('Response schema: /id', { exact: true })).toBeVisible();
  await expect(page.getByText('must be integer', { exact: true })).toBeVisible();
  await expect(page.getByText('200 OK')).toBeVisible();

  await editor.fill(schema.replace('integer', 'string'));
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('1 passed', { exact: true })).toBeVisible();

  await editor.fill('not-json');
  await expect(page.getByRole('alert')).toContainText('not valid JSON');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Response schema is not valid JSON', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Validate response against schema' }).uncheck();
  await expect(editor).toHaveText('not-json');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('200 OK')).toBeVisible();
  await expect(page.getByRole('button', { name: /Tests/ })).toHaveCount(0);
});

test('saves and exports schemas and includes their failures in collection reports', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Response schema JSON' }).fill(schema);
  await page.getByRole('checkbox', { name: 'Validate response against schema' }).check();
  await page.keyboard.press('Control+s');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('curlit_collections')!)[0].requests[0].responseSchema))
    .toEqual({ enabled: true, schema });

  await page.reload();
  await page.getByText('Schema suite', { exact: true }).click();
  await page.getByRole('button', { name: 'GET Schema request', exact: true }).click();
  await page.getByRole('button', { name: /^Schema\d*$/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Validate response against schema' })).toBeChecked();
  await expect(page.getByRole('textbox', { name: 'Response schema JSON' })).toHaveText(schema);

  await collectionMenu(page);
  const exportDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const exported = JSON.parse(await readFile((await (await exportDownload).path())!, 'utf8'));
  expect(exported.collections[0].requests[0].responseSchema).toEqual({ enabled: true, schema });

  await collectionMenu(page);
  await page.getByRole('button', { name: 'Run collection' }).click();
  await page.getByRole('button', { name: 'Start Run', exact: true }).click();
  await expect(page.getByText(/Completed 1\/1 in/)).toBeVisible();
  const jsonDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON report', exact: true }).click();
  const report = JSON.parse(await readFile((await (await jsonDownload).path())!, 'utf8'));
  expect(report.summary).toMatchObject({ passed: 0, failed: 1, errored: 0 });
  expect(report.requests[0].tests).toEqual([{ name: 'Response schema: /id', passed: false, error: 'must be integer' }]);
  const xmlDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JUnit report', exact: true }).click();
  const xml = await readFile((await (await xmlDownload).path())!, 'utf8');
  expect(xml).toContain('failures="1" errors="0"');
  expect(xml).toContain('Response schema: /id');
});
