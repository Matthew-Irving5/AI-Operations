import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? '3000');
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const reuseExistingServer = process.env.LOCAL_QA_REUSE_WEB_SERVER === 'true';
const namespace = process.env.E2E_NAMESPACE;
if (!Number.isInteger(port) || port < 1024 || port > 65_535)
  throw new Error('E2E_PORT must be an available non-privileged TCP port.');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  outputDir: namespace ? `test-results/local/${namespace}` : 'test-results',
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: {
    command: `corepack pnpm --filter @ai-operations/web exec next dev --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/login`,
    reuseExistingServer,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'synthetic-development-key-only',
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['iPhone 13'] } },
  ],
});
