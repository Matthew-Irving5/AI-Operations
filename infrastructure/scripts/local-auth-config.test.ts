import test from 'node:test';
import assert from 'node:assert/strict';
import { configureLocalAuthCallback } from './local-auth-config';

test('the isolated Auth callback allowlist follows the allocated browser port', () => {
  const config = `[auth]\nenabled = true\nsite_url = "http://127.0.0.1:3000"\nadditional_redirect_urls = [\n  "http://127.0.0.1:3000/auth/callback",\n  "http://localhost:3000/auth/callback",\n]\n\n[auth.rate_limit]\nemail_sent = 2\n`;

  const result = configureLocalAuthCallback(config, 41_337);

  assert.match(result, /site_url = "http:\/\/127\.0\.0\.1:41337"/);
  assert.match(result, /"http:\/\/127\.0\.0\.1:41337\/auth\/callback"/);
  assert.match(result, /"http:\/\/localhost:41337\/auth\/callback"/);
  assert.match(result, /\[auth\.rate_limit\]\nemail_sent = 2/);
  assert.doesNotMatch(result, /127\.0\.0\.1:3000\/auth\/callback/);
});

test('invalid isolated app ports are rejected', () => {
  assert.throws(() => configureLocalAuthCallback('[auth]', 80), /app port is invalid/);
});

test('the default local app port is accepted when its callback is already configured', () => {
  const config = `[auth]\nenabled = true\nsite_url = "http://127.0.0.1:3000"\nadditional_redirect_urls = [\n  "http://127.0.0.1:3000/auth/callback",\n  "http://localhost:3000/auth/callback",\n]\n`;

  assert.equal(configureLocalAuthCallback(config, 3000), config);
});
