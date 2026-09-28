import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e-live',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: 'list',
  use: {
    baseURL:
      process.env.LIVE_E2E_BASE_URL ?? 'https://ai-operations-staging.ai-operations.workers.dev',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    launchOptions: { headless: process.env.LIVE_E2E_MANUAL_MFA !== 'true' },
  },
  projects: [{ name: 'staging-chromium', use: { ...devices['Desktop Chrome'] } }],
});
