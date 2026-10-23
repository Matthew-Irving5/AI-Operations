import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPinnedSupabaseCliVersion,
  isSupportedNodeVersion,
  pinnedSupabaseCliVersion,
} from './qa-doctor';

test('qa doctor accepts the pinned Node floor and newer versions', () => {
  assert.equal(isSupportedNodeVersion('22.18.0'), true);
  assert.equal(isSupportedNodeVersion('23.0.0'), true);
  assert.equal(isSupportedNodeVersion('22.17.9'), false);
});

const supabaseLockfile = `importers:
  .:
    devDependencies:
      supabase:
        specifier: ^2.118.0
        version: 2.118.0
`;

test('qa doctor reads and enforces the lockfile-pinned Supabase CLI version', () => {
  assert.equal(pinnedSupabaseCliVersion(supabaseLockfile), '2.118.0');
  assert.equal(isPinnedSupabaseCliVersion(supabaseLockfile, '2.118.0'), true);
  assert.equal(isPinnedSupabaseCliVersion(supabaseLockfile, '2.120.0'), false);
});

test('qa doctor fails closed when the lockfile does not pin Supabase', () => {
  assert.throws(() => pinnedSupabaseCliVersion('importers:\n  .:\n'), /does not pin/);
});
