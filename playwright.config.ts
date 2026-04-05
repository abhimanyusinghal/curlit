import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  webServer: [
    {
      command: 'npx vite --port 5173',
      port: 5173,
      reuseExistingServer: true,
    },
    {
      command: 'node server/proxy.js',
      port: 3001,
      reuseExistingServer: true,
    },
  ],
  use: {
    baseURL: 'http://localhost:5173',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
