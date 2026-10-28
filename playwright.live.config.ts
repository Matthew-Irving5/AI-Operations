import { defineConfig, devices } from '@playwright/test';
import { liveE2eBrowserEnvironment } from './infrastructure/scripts/live-e2e-browser-environment';

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
    ...(process.env.LIVE_E2E_STORAGE_STATE
      ? { storageState: process.env.LIVE_E2E_STORAGE_STATE }
      : {}),
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    launchOptions: {
      env: liveE2eBrowserEnvironment(process.env),
      headless: process.env.LIVE_E2E_MANUAL_MFA !== 'true',
      ...(process.env.LIVE_E2E_MANUAL_MFA === 'true'
        ? { args: ['--window-position=40,40', '--window-size=1280,900'] }
        : {}),
    },
  },
  projects: [{ name: 'staging-chromium', use: { ...devices['Desktop Chrome'] } }],
});
