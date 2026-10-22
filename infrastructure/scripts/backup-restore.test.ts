import assert from 'node:assert/strict';
import test from 'node:test';
import { assertIsolatedRestoreTarget } from './backup-restore.js';
import {
  assertIsolatedLocalRecoveryTarget,
  assertIsolatedLocalSourceProject,
  assertLoopbackS3Endpoint,
  assertRecoveryBucketEmpty,
} from './restore-target.js';

test('staging restore requires a known production project and distinct target', () => {
  assert.doesNotThrow(() =>
    assertIsolatedRestoreTarget(
      'staging-project-ref',
      'recovery-project-ref',
      'production-project-ref',
    ),
  );
  assert.throws(
    () =>
      assertIsolatedRestoreTarget(
        'staging-project-ref',
        'production-project-ref',
        'production-project-ref',
      ),
    /restore_target_project_not_isolated/,
  );
  assert.throws(
    () =>
      assertIsolatedRestoreTarget(
        'staging-project-ref',
        'staging-project-ref',
        'production-project-ref',
      ),
    /restore_target_project_not_isolated/,
  );
  assert.throws(
    () => assertIsolatedRestoreTarget('staging-project-ref', 'recovery-project-ref', ''),
    /restore_target_project_not_isolated/,
  );
});

const isolatedLocalConfig = `project_id = "aiops-ai45-recovery"

[api]
port = 55421

[db]
port = 55422
shadow_port = 55420

[studio]
port = 55423

[inbucket]
port = 55424
`;

test('local recovery accepts only explicit loopback MinIO endpoints', () => {
  assert.equal(assertLoopbackS3Endpoint('http://127.0.0.1:9000'), 'http://127.0.0.1:9000');
  assert.equal(assertLoopbackS3Endpoint('http://[::1]:9000'), 'http://[::1]:9000');
  for (const endpoint of [
    'https://127.0.0.1:9000',
    'http://localhost:9000',
    'http://192.168.1.4:9000',
    'http://127.0.0.1:9000/bucket',
    'http://user:password@127.0.0.1:9000',
    'http://127.0.0.1:9000?target=remote',
  ]) {
    assert.throws(() => assertLoopbackS3Endpoint(endpoint), /restore_local_s3_endpoint/);
  }
});

test('local recovery requires an isolated workdir, project id, and port block', () => {
  const result = assertIsolatedLocalRecoveryTarget(
    'C:\\recovery\\ai45',
    'C:\\worktrees\\ai-45',
    isolatedLocalConfig,
    'staging-project-ref',
    'production-project-ref',
  );
  assert.equal(result.workdir, 'C:\\recovery\\ai45');
  assert.equal(result.projectId, 'aiops-ai45-recovery');

  assert.throws(
    () =>
      assertIsolatedLocalRecoveryTarget(
        'C:\\worktrees\\ai-45\\supabase',
        'C:\\worktrees\\ai-45',
        isolatedLocalConfig,
        'staging-project-ref',
        'production-project-ref',
      ),
    /restore_local_target_not_isolated/,
  );
  assert.throws(
    () =>
      assertIsolatedLocalRecoveryTarget(
        'C:\\recovery\\ai45',
        'C:\\worktrees\\ai-45',
        isolatedLocalConfig.replace('aiops-ai45-recovery', 'ai-operations-local'),
        'staging-project-ref',
        'production-project-ref',
      ),
    /restore_local_project_id_not_isolated/,
  );
  assert.throws(
    () =>
      assertIsolatedLocalRecoveryTarget(
        'C:\\recovery\\ai45',
        'C:\\worktrees\\ai-45',
        isolatedLocalConfig.replace('55422', '54322'),
        'staging-project-ref',
        'production-project-ref',
      ),
    /restore_local_ports_not_isolated/,
  );
  assert.throws(
    () =>
      assertIsolatedLocalRecoveryTarget(
        'relative\\recovery',
        'C:\\worktrees\\ai-45',
        isolatedLocalConfig,
        'staging-project-ref',
        'production-project-ref',
      ),
    /restore_local_workdir_invalid/,
  );
});

test('local synthetic source allows its own project ref while excluding production', () => {
  const result = assertIsolatedLocalSourceProject(
    'C:\\recovery\\ai45-source',
    'C:\\worktrees\\ai-45',
    isolatedLocalConfig.replace('aiops-ai45-recovery', 'aiops-ai45-source'),
    'production-project-ref',
  );
  assert.equal(result.projectId, 'aiops-ai45-source');
  assert.throws(
    () =>
      assertIsolatedLocalSourceProject(
        'C:\\recovery\\ai45-source',
        'C:\\worktrees\\ai-45',
        isolatedLocalConfig.replace('aiops-ai45-recovery', 'production-project-ref'),
        'production-project-ref',
      ),
    /restore_local_project_id_not_isolated/,
  );
});

test('restore requires an empty recovery bucket and follows every listing page', async () => {
  const tokens: Array<string | undefined> = [];
  const pages = [
    { objectCount: 0, isTruncated: true, nextContinuationToken: 'page-2' },
    { objectCount: 0, isTruncated: false },
  ];
  await assertRecoveryBucketEmpty(async (token) => {
    tokens.push(token);
    const page = pages.shift();
    assert.ok(page);
    return page;
  });
  assert.deepEqual(tokens, [undefined, 'page-2']);

  await assert.rejects(
    () => assertRecoveryBucketEmpty(async () => ({ objectCount: 1, isTruncated: false })),
    /restore_target_bucket_not_empty/,
  );
  await assert.rejects(
    () =>
      assertRecoveryBucketEmpty(async () => ({
        objectCount: 0,
        isTruncated: true,
        nextContinuationToken: 'same',
      })),
    /restore_bucket_listing_invalid/,
  );
});
