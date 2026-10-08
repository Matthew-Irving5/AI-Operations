import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.DESIGN_SYSTEM_VISUAL_PORT ?? '4311');

export default defineConfig({
  testDir: './tests/visual',
  outputDir: 'test-results/design-system-visual',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  fullyParallel: true,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `corepack pnpm exec tsx --tsconfig infrastructure/scripts/tsconfig.visual.json infrastructure/scripts/design-system-visual-fixture.tsx`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: { ...process.env, DESIGN_SYSTEM_VISUAL_PORT: String(port) },
  },
});
