import assert from 'node:assert/strict';
import test from 'node:test';
import { requiredBrowsersFromPlaywrightArgs } from './local-qa-preflight';

test('Chromium-only debug runs do not require WebKit', () => {
  assert.deepEqual(requiredBrowsersFromPlaywrightArgs(['--project=chromium']), ['chromium']);
  assert.deepEqual(requiredBrowsersFromPlaywrightArgs(['--project', 'webkit']), ['webkit']);
  assert.deepEqual(requiredBrowsersFromPlaywrightArgs([]), ['chromium', 'webkit']);
});
