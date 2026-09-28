import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? '3000');
const namespace = process.env.E2E_NAMESPACE;
if (!Number.isInteger(port) || port < 1024 || port > 65_535)
  throw new Error('E2E_PORT must be an available non-privileged TCP port.');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  outputDir: namespace ? `test-results/local/${namespace}` : 'test-results',
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  webServer: {
    command: `corepack pnpm --filter @ai-operations/web dev -- --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/login`,
    reuseExistingServer: false,
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
