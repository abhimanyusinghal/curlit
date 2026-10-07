import { test, expect, type Route } from '@playwright/test';
import { readFile } from 'node:fs/promises';

function response(time: number) {
  return { contentType: 'application/json', body: JSON.stringify({ status: 200, statusText: 'OK', body: '{}', headers: {}, cookies: [], time, httpTimeMs: time }) };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('benchmarks a request, excludes warm-up, exports reports and clears results on rerun', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/proxy', route => route.fulfill(response([500, 10, 20][calls++ % 3])));
  await page.getByPlaceholder('Enter URL or paste cURL command...').fill('https://example.test/benchmark');
  await page.getByRole('button', { name: 'Benchmark request' }).click();
  const dialog = page.getByRole('dialog', { name: /Benchmark/ });
  await dialog.getByLabel('Iterations', { exact: true }).fill('2');
  await dialog.getByLabel('Warm-up iterations').fill('1');
  await dialog.getByLabel('Thresholds (optional)').fill('p95<25, failureRate<=0');
  await dialog.getByRole('button', { name: 'Start benchmark' }).click();
  await expect(dialog.getByRole('status')).toContainText('Benchmark passed');
  expect(calls).toBe(3);
  await expect(dialog.getByRole('table')).toContainText('15.00');
  await expect(dialog.getByRole('table')).toContainText('19.50');

  const jsonDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export benchmark JSON report' }).click();
  const report = JSON.parse(await readFile((await (await jsonDownload).path())!, 'utf8'));
  expect(report.summary).toMatchObject({ completed: 2, warmup: { completed: 1 }, latency: { avg: 15, samples: 2 } });
  const xmlDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export benchmark JUnit report' }).click();
  expect(await readFile((await (await xmlDownload).path())!, 'utf8')).toContain('tests="5" failures="0" errors="0" skipped="0"');

  await dialog.getByLabel('Thresholds (optional)').fill('p95<1');
  await dialog.getByRole('button', { name: 'Run benchmark again' }).click();
  await expect(dialog.getByRole('status')).toContainText('Benchmark failed');
  await expect(dialog.getByText(/FAIL.*p95<1/)).toBeVisible();
  expect(calls).toBe(6);
});

test('validates options before running and cancels an in-flight request', async ({ page }) => {
  let held: Route | undefined;
  await page.route('**/api/proxy', route => { held = route; });
  await page.getByPlaceholder('Enter URL or paste cURL command...').fill('https://example.test/hang');
  await page.getByRole('button', { name: 'Benchmark request' }).click();
  const dialog = page.getByRole('dialog', { name: /Benchmark/ });
  await dialog.getByLabel('Iterations', { exact: true }).fill('0');
  await dialog.getByRole('button', { name: 'Start benchmark' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Iterations must be an integer');
  expect(held).toBeUndefined();
  await dialog.getByLabel('Iterations', { exact: true }).fill('10');
  await dialog.getByRole('button', { name: 'Start benchmark' }).click();
  await expect.poll(() => !!held).toBe(true);
  await dialog.getByRole('button', { name: 'Stop benchmark' }).click();
  await expect(dialog.getByRole('status')).toContainText('Benchmark aborted');
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export benchmark JSON report' }).click();
  const report = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(report.summary).toMatchObject({ total: 10, completed: 1, skipped: 9, latency: { samples: 0 } });
  await held?.abort().catch(() => {});
});

test('benchmarks a collection through its context menu', async ({ page }) => {
  await page.route('**/api/proxy', route => route.fulfill(response(12)));
  await page.evaluate(() => localStorage.setItem('curlit_collections', JSON.stringify([{
    id: 'perf', name: 'Performance suite', createdAt: 1, updatedAt: 1,
    requests: ['One', 'Two'].map(name => ({ id: name, name, url: 'https://example.test', method: 'GET', headers: [], params: [], auth: { type: 'none' }, body: { type: 'none', raw: '', formData: [], urlencoded: [] } })),
  }])));
  await page.reload();
  await page.getByText('Performance suite', { exact: true }).hover();
  await page.locator('.group:has-text("Performance suite") button').last().click();
  await page.getByRole('button', { name: 'Benchmark collection' }).click();
  const dialog = page.getByRole('dialog', { name: 'Benchmark — Performance suite' });
  await dialog.getByLabel('Iterations', { exact: true }).fill('2');
  await dialog.getByRole('button', { name: 'Start benchmark' }).click();
  await expect(dialog.getByRole('status')).toContainText('4/4 measured requests');
  await expect(dialog.getByRole('table').getByRole('row')).toHaveCount(3);
});
