import assert from 'node:assert/strict';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import {
  assertIsolatedRestoreTarget,
  corepackInvocation,
  restoreLocalDatabaseFile,
  rowsMatching,
} from './backup-restore.js';
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

test('local restore imports a full SQL dump with psql error propagation and cleanup', async () => {
  const calls: Array<{ command: string; args: string[]; maxBuffer?: number }> = [];
  await restoreLocalDatabaseFile(
    'aiops-ai45-recovery',
    'C:\\temp\\database.sql',
    async (command, args, maxBuffer) => {
      calls.push({ command, args, ...(maxBuffer === undefined ? {} : { maxBuffer }) });
      return command === 'docker' && args[0] === 'ps' ? 'supabase_db_aiops-ai45-recovery\n' : '';
    },
  );

  const psql = calls.find(({ args }) => args[0] === 'exec' && args.includes('psql'));
  assert.ok(psql);
  assert.ok(psql.args.includes('--single-transaction'));
  assert.deepEqual(psql.args.slice(psql.args.indexOf('--set'), psql.args.indexOf('--set') + 2), [
    '--set',
    'ON_ERROR_STOP=1',
  ]);
  assert.ok(calls.some(({ args }) => args[0] === 'cp' && args[1] === 'C:\\temp\\database.sql'));
  assert.ok(calls.some(({ args }) => args[0] === 'exec' && args.includes('rm')));
});

test('local restore returns a sanitized import error and still removes its temporary dump', async () => {
  let cleanupCalled = false;
  await assert.rejects(
    () =>
      restoreLocalDatabaseFile(
        'aiops-ai45-recovery',
        'C:\\temp\\database.sql',
        async (_command, args) => {
          if (args[0] === 'ps') return 'supabase_db_aiops-ai45-recovery\n';
          if (args.includes('psql')) throw new Error('SQL payload must not reach CLI output');
          if (args.includes('rm')) cleanupCalled = true;
          return '';
        },
      ),
    /restore_local_database_import_failed/,
  );
  assert.equal(cleanupCalled, true);
});

test('local restore refuses to copy into an unverified database container', async () => {
  const calls: Array<string[]> = [];
  await assert.rejects(
    () =>
      restoreLocalDatabaseFile(
        'aiops-ai45-recovery',
        'C:\\temp\\database.sql',
        async (_command, args) => {
          calls.push(args);
          return 'supabase_db_other-project\n';
        },
      ),
    /restore_local_database_container_not_running/,
  );
  assert.equal(calls.length, 1);
});

test('Supabase CLI runs Corepack without a shell on Windows', () => {
  const args = ['pnpm', 'exec', 'supabase', 'db', 'push', '--local', '--yes'];
  const invocation = corepackInvocation(args);
  if (process.platform === 'win32') {
    assert.equal(invocation.command, process.execPath);
    assert.equal(
      invocation.args[0],
      resolve(dirname(process.execPath), 'node_modules/corepack/dist/corepack.js'),
    );
    assert.deepEqual(invocation.args.slice(1), args);
  } else {
    assert.equal(invocation.command, 'corepack');
    assert.deepEqual(invocation.args, args);
  }
});

test('Supabase database query parser ignores CLI diagnostics around the JSON envelope', () => {
  const output = [
    'Connecting to local database...',
    JSON.stringify({
      boundary: 'fixture',
      rows: [{ migration_version: '20261021141700' }],
      warning: 'untrusted text containing } and { characters',
    }),
    'A new version of Supabase CLI is available: v2.121.0',
  ].join('\n');
  assert.deepEqual(rowsMatching(output, ['migration_version']), [
    { migration_version: '20261021141700' },
  ]);
  assert.throws(() => rowsMatching('query returned no JSON rows', ['migration_version']), {
    message: 'backup_database_query_invalid_json',
  });
});
