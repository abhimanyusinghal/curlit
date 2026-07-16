import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import path from 'node:path';

test.describe('Electron desktop runtime', () => {
  let app: ElectronApplication;
  let api: Server;
  let apiUrl: string;

  test.beforeAll(async () => {
    api = createServer((request, response) => {
      response.writeHead(200, {
        'content-type': 'application/json',
        'x-curlit-method': request.method ?? '',
      });
      response.end(JSON.stringify({ source: 'electron-ipc', method: request.method }));
    });
    await new Promise<void>((resolve, reject) => {
      api.once('error', reject);
      api.listen(0, '127.0.0.1', resolve);
    });
    const address = api.address();
    if (!address || typeof address === 'string') throw new Error('Test API did not bind to a TCP port');
    apiUrl = `http://127.0.0.1:${address.port}/verify`;

    const electronEnv = { ...process.env, NODE_ENV: 'test' };
    delete electronEnv.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({
      args: [path.resolve('electron/main.cjs')],
      cwd: process.cwd(),
      env: electronEnv,
    });
  });

  test.afterAll(async () => {
    await app?.close();
    await new Promise<void>(resolve => api?.close(() => resolve()));
  });

  test('loads the packaged renderer, shows its version, and sends HTTP over IPC', async () => {
    const page = await app.firstWindow();
    await expect(page).toHaveTitle('CurlIt - API Testing Tool');
    await expect(page.getByText(/CurlIt v\d+\.\d+\.\d+/)).toBeVisible();

    await page.getByPlaceholder('Enter URL or paste cURL command...').fill(apiUrl);
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    await expect(page.getByText('200 OK')).toBeVisible();
    await expect(page.getByText(/electron-ipc/)).toBeVisible();
    await page.getByRole('button', { name: /Headers/ }).last().click();
    await expect(page.getByText(/x-curlit-method/i)).toBeVisible();
  });
});
