import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../..');
const apiUrl = 'http://127.0.0.1:8000/health/live';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command:
        'uv run --package fisheye-api uvicorn fisheye_api.main:app --host 127.0.0.1 --port 8000',
      cwd: repositoryRoot,
      url: apiUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command:
        'uv run --package fisheye-worker fisheye-worker work --poll-seconds 0.2',
      cwd: repositoryRoot,
      timeout: 120_000,
    },
    {
      command: 'pnpm dev:console',
      cwd: repositoryRoot,
      url: 'http://127.0.0.1:3000/login',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
