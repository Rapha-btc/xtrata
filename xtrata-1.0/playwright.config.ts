import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 4173);
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1';
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;

export default defineConfig({
  testDir: './browser-tests',
  testMatch: ['**/*.pw.ts'],
  fullyParallel: false,
  timeout: 120_000,
  expect: {
    timeout: 15_000
  },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: executablePath
      ? {
          executablePath
        }
      : undefined
  },
  webServer: skipWebServer
    ? undefined
    : {
        command: `npm run dev:pages:test -- --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000
      }
});
