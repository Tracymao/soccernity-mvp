import { defineConfig } from '@playwright/test';
import { URLS } from './support/stack';

// Real Chrome (channel: 'chrome') so no browser download is needed. One
// worker, serial: the suite shares one database and walks long stateful flows.
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['json', { outputFile: '.run/results.json' }]],
  globalSetup: require.resolve('./support/global-setup'),
  use: {
    baseURL: URLS.web,
    channel: 'chrome',
    headless: true,
    viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  outputDir: '.run/artifacts',
});
