import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? '3000');
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;
const namespace = process.env.E2E_NAMESPACE;
const wslRoot = process.env.LOCAL_QA_WSL_BUILD_ROOT;
const wslDistro = process.env.LOCAL_QA_WSL_DISTRO ?? 'Ubuntu';
if (process.platform === 'win32' && !wslRoot)
  throw new Error('The local WSL OpenNext workspace was not configured.');
const workerCommand =
  process.platform === 'win32'
    ? `wsl.exe -d ${wslDistro} -- bash ${wslRoot}/infrastructure/scripts/wsl-worker-preview.sh`
    : 'bash infrastructure/scripts/local-worker-preview.sh';
const webServerEnv = { ...process.env };
for (const name of [
  'LOCAL_TEST_AUTH',
  'LOCAL_TEST_APP_ORIGIN',
  'LOCAL_TEST_EMAIL',
  'LOCAL_TEST_PASSWORD',
  'LOCAL_TEST_AUTH_SIGNING_KEYS',
  'LOCAL_TEST_STAGING_ANON_KEY',
  'LOCAL_TEST_STAGING_EMAIL',
  'LOCAL_TEST_STAGING_PASSWORD',
  'LOCAL_QA_WORKER_PREVIEW',
  'E2E_JWT_SECRET',
]) {
  webServerEnv[name] = undefined;
}
webServerEnv.LOCAL_QA_DIST_DIR = undefined;
if (process.platform !== 'win32') {
  webServerEnv.LOCAL_QA_WSL_DISTRO = undefined;
  webServerEnv.LOCAL_QA_WSL_BUILD_ROOT = undefined;
  webServerEnv.LOCAL_QA_WSL_NODE_BIN = undefined;
}
webServerEnv.NODE_ENV = 'production';
webServerEnv.APP_ENV = 'local';
webServerEnv.PUBLIC_APP_ORIGIN = baseURL;
if (process.platform === 'win32') {
  webServerEnv.LOCAL_QA_SOURCE_ROOT = process.cwd();
  webServerEnv.WSLENV = [
    ...new Set([
      ...(webServerEnv.WSLENV?.split(':') ?? []),
      'APP_ENV',
      'E2E_BASE_URL',
      'E2E_PORT',
      'LOCAL_QA_DIST_DIR',
      'LOCAL_QA_SOURCE_ROOT/p',
      'LOCAL_QA_WSL_BUILD_ROOT',
      'LOCAL_QA_WSL_NODE_BIN',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_URL',
      'PUBLIC_APP_ORIGIN',
    ]),
  ].join(':');
}

if (!Number.isInteger(port) || port < 1024 || port > 65_535)
  throw new Error('E2E_PORT must be an available non-privileged TCP port.');

export default defineConfig({
  testDir: './tests/e2e-worker',
  fullyParallel: false,
  outputDir: namespace ? `test-results/local-worker/${namespace}` : 'test-results/local-worker',
  use: { baseURL, trace: 'off' },
  webServer: {
    command: workerCommand,
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: webServerEnv,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
