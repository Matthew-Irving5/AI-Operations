import test from 'node:test';
import assert from 'node:assert/strict';
import { isSupportedNodeVersion } from './qa-doctor';

test('qa doctor accepts the pinned Node floor and newer versions', () => {
  assert.equal(isSupportedNodeVersion('22.18.0'), true);
  assert.equal(isSupportedNodeVersion('23.0.0'), true);
  assert.equal(isSupportedNodeVersion('22.17.9'), false);
});
