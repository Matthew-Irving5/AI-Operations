import assert from 'node:assert/strict';
import test from 'node:test';
import { liveE2eBrowserEnvironment } from './live-e2e-browser-environment.js';

test('live E2E runner keeps the staging Management API token out of browser process environment', () => {
  const browserEnvironment = liveE2eBrowserEnvironment({
    STAGING_PERSONAL_ACCESS_TOKEN: 'runner-only-test-token',
    LIVE_E2E_BASE_URL: 'https://ai-operations-staging.ai-operations.workers.dev',
    PATH: 'safe-system-path',
  });

  assert.equal(browserEnvironment.STAGING_PERSONAL_ACCESS_TOKEN, undefined);
  assert.deepEqual(browserEnvironment, {
    LIVE_E2E_BASE_URL: 'https://ai-operations-staging.ai-operations.workers.dev',
    PATH: 'safe-system-path',
  });
});
