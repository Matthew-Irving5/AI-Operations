import test from 'node:test';
import assert from 'node:assert/strict';
import { isInstalledNextVersionCurrent, isSupportedNodeVersion } from './qa-doctor';

test('qa doctor accepts the pinned Node floor and newer versions', () => {
  assert.equal(isSupportedNodeVersion('22.18.0'), true);
  assert.equal(isSupportedNodeVersion('23.0.0'), true);
  assert.equal(isSupportedNodeVersion('22.17.9'), false);
});

test('qa doctor rejects a stale installed Next.js version', () => {
  assert.equal(isInstalledNextVersionCurrent('16.4.1', '16.4.1'), true);
  assert.equal(isInstalledNextVersionCurrent('16.4.1', '16.3.8'), false);
  assert.equal(isInstalledNextVersionCurrent('16.4.1', undefined), false);
});
