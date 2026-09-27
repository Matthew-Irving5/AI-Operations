import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  compareInventory,
  compareMigrations,
  compareSourceAttestations,
  compareSourceDigests,
  migrationVersionFromFilename,
  parseFunctionAuth,
  sourceFileDigests,
  validateConfig,
  missingGitHubEnvironmentNames,
  validateStagingSnapshot,
  type FunctionInventory,
  type WorkerInventory,
} from './environment-drift.js';

const functions: FunctionInventory = [
  { slug: 'manager-list', verify_jwt: true, version: 10, ezbr_sha256: 'sha-a' },
  { slug: 'job-worker', verify_jwt: false, version: 11, ezbr_sha256: 'sha-b' },
];
const worker: WorkerInventory = {
  vars: {
    APP_ENV: 'staging',
    PUBLIC_APP_ORIGIN: 'https://ai-operations-staging.ai-operations.workers.dev',
  },
  bindings: [
    'assets:ASSETS',
    'r2:ARCHIVE_BUCKET:ai-operations-staging',
    'secret:FINANCE_ARCHIVE_GATEWAY_SECRET',
  ],
};
const inventory = {
  migrations: ['20260101000000_initial', '20260102000000_policy'],
  schemaDigest: 'schema-a',
  functions,
  sourceDigest: 'a'.repeat(64),
  secrets: ['FINANCE_ARCHIVE_GATEWAY_SECRET', 'PUBLIC_APP_ORIGIN'],
  worker,
};

test('accepts same release bundle attestations while ignoring deployment versions', () => {
  const production = {
    ...inventory,
    functions: functions.map((entry) => ({
      ...entry,
      version: entry.version + 20,
    })),
    worker: {
      ...worker,
      vars: { APP_ENV: 'prod-hash', PUBLIC_APP_ORIGIN: 'production-origin-hash' },
      bindings: [
        'assets:ASSETS',
        'r2:ARCHIVE_BUCKET:production-bucket',
        'secret:FINANCE_ARCHIVE_GATEWAY_SECRET',
      ],
    },
  };
  assert.deepEqual(compareInventory(inventory, production, ['staging', 'production']), []);
});

test('detects migration expectation drift before deployment', () => {
  assert.deepEqual(
    compareMigrations(
      ['20260101000000_initial', '20260102000000_policy', '20260103000000_new'],
      ['20260101000000_initial', '20260102000000_policy'],
      'repo ↔ staging',
    ),
    ['repo ↔ staging: applied migration versions differ'],
  );
});

test('normalizes repository migration filenames to provider version identifiers', () => {
  assert.equal(migrationVersionFromFilename('202608020001_foundation.sql'), '202608020001');
  assert.equal(
    migrationVersionFromFilename('20260927160301_allow_locked_owner_for_gmail_test.sql'),
    '20260927160301',
  );
  assert.throws(() => migrationVersionFromFilename('foundation.sql'));
});

test('maps all 39 local Edge Functions to configured or default JWT verification', () => {
  const directories = readdirSync('supabase/functions', { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map(({ name }) => name);
  const auth = parseFunctionAuth(readFileSync('supabase/config.toml', 'utf8'), directories);
  assert.equal(auth.size, 39);
  assert.deepEqual(
    [...auth.keys()].sort(),
    directories.filter((name) => !name.startsWith('_')).sort(),
  );
  assert.equal(auth.get('notification-test'), true);
  assert.equal(auth.get('onboarding-update'), true);
  assert.equal(auth.get('personal-profile'), false);
});

test('fails closed on malformed and duplicate function auth configuration', () => {
  assert.throws(() => parseFunctionAuth('[functions.bad]\nverify_jwt = perhaps\n', ['bad']));
  assert.throws(() =>
    parseFunctionAuth(
      '[functions.duplicate]\nverify_jwt = true\n[functions.duplicate]\nverify_jwt = false\n',
      [],
    ),
  );
});

test('fingerprints runtime TypeScript while excluding test-only source files', () => {
  const root = mkdtempSync(join(tmpdir(), 'ai-ops-drift-test-'));
  try {
    mkdirSync(join(root, '_shared'), { recursive: true });
    writeFileSync(
      join(root, 'index.ts'),
      'import { contract } from "./_shared/contract.ts";\nexport const value = contract;\n',
    );
    writeFileSync(join(root, '_shared', 'contract.ts'), 'export const contract = true;\n');
    writeFileSync(join(root, '_shared', 'contract_test.ts'), 'test-only fixture');
    writeFileSync(join(root, '_shared', 'unused.ts'), 'not included by any runtime import');
    const expected = sourceFileDigests(root);
    const deployed = { ...expected, '_shared/contract.ts': 'different-digest' };
    assert.deepEqual(compareSourceDigests(expected, deployed), ['_shared/contract.ts']);
    assert.equal(Object.hasOwn(expected, '_shared/contract_test.ts'), false);
    assert.equal(Object.hasOwn(expected, '_shared/unused.ts'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('detects schema, function inventory, auth, release attestation, and worker drift', () => {
  const drifted = {
    migrations: ['20260101000000_initial'],
    schemaDigest: 'schema-b',
    functions: [
      { ...functions[0]!, verify_jwt: false, ezbr_sha256: 'sha-changed' },
      { slug: 'new-function', verify_jwt: false, version: 1, ezbr_sha256: 'sha-new' },
    ],
    sourceDigest: 'b'.repeat(64),
    worker: {
      ...worker,
      vars: { ...worker.vars, APP_ENV: 'production', FUTURE_FEATURE_FLAG: 'hashed-config-value' },
    },
    secrets: ['FINANCE_ARCHIVE_GATEWAY_SECRET'],
  };
  const mismatches = compareInventory(inventory, drifted, ['staging', 'production']);
  assert.ok(mismatches.some((mismatch) => mismatch.includes('migration versions differ')));
  assert.ok(mismatches.some((mismatch) => mismatch.includes('schema objects differ')));
  assert.ok(
    mismatches.some((mismatch) => mismatch.includes('new-function exists in only one environment')),
  );
  assert.ok(mismatches.some((mismatch) => mismatch.includes('manager-list verify_jwt differs')));
  assert.ok(
    mismatches.some((mismatch) =>
      mismatch.includes('manager-list deployed bundle attestation differs'),
    ),
  );
  assert.ok(mismatches.some((mismatch) => mismatch.includes('release source attestations differ')));
  assert.ok(
    mismatches.some((mismatch) => mismatch.includes('Worker runtime configuration differs')),
  );
});

test('rejects swapped environment project, callback origin, and Worker identity', () => {
  const result = validateConfig('staging', {
    projectRef: 'epmgvknrydadzitzupzx',
    supabaseUrl: 'https://epmgvknrydadzitzupzx.supabase.co',
    origin: 'https://ai-operations-production.ai-operations.workers.dev',
    appEnv: 'production',
    workerName: 'ai-operations-production',
    archiveBucket: 'ai-operations-production',
  });
  assert.equal(result.ok, false);
  assert.equal(result.mismatches.length, 6);
  assert.ok(result.mismatches.every((mismatch) => !/https?:\/\//.test(mismatch)));
});

test('keeps secret values out of parity diagnostics', () => {
  const sentinel = 'never-print-this-secret-value';
  const result = validateConfig('production', {
    projectRef: 'wrong',
    supabaseUrl: 'https://wrong.supabase.co',
    origin: 'https://wrong.example.com',
    appEnv: sentinel,
    workerName: 'wrong',
    archiveBucket: 'wrong',
  });
  assert.equal(JSON.stringify(result).includes(sentinel), false);
});

test('checks required GitHub Actions secret and variable names without values', () => {
  const missing = missingGitHubEnvironmentNames('staging', {
    secrets: ['STAGING_SUPABASE_ACCESS_TOKEN'],
    variables: [],
  });
  assert.ok(
    missing.includes(
      'staging: required GitHub environment secret name missing: CLOUDFLARE_API_TOKEN',
    ),
  );
  assert.ok(
    missing.includes(
      'staging: required GitHub environment variable name missing: FINANCE_ARCHIVE_GATEWAY_URL',
    ),
  );
  const complete = missingGitHubEnvironmentNames('staging', {
    secrets: [
      'CLOUDFLARE_ACCOUNT_ID',
      'CLOUDFLARE_API_TOKEN',
      'FINANCE_ARCHIVE_GATEWAY_SECRET',
      'STAGING_SUPABASE_ACCESS_TOKEN',
      'STAGING_SUPABASE_ANON_KEY',
      'STAGING_SUPABASE_DB_PASSWORD',
      'STAGING_SUPABASE_PROJECT_REF',
      'STAGING_SUPABASE_URL',
    ],
    variables: ['FINANCE_ARCHIVE_GATEWAY_URL'],
  });
  assert.deepEqual(complete, []);
});

test('requires a passing staging inventory from the exact production release commit', () => {
  const report = {
    ok: true,
    mismatches: [],
    evidence: {
      mode: 'repo-staging',
      environment: 'staging',
      sourceCommit: 'a'.repeat(40),
      sourceAttestation: {
        commit: 'a'.repeat(40),
        sourceDigest: 'c'.repeat(64),
        supabaseCliVersion: '2.111.0',
      },
      githubEnvironment: { secrets: [], variables: [] },
      inventorySnapshot: {
        migrations: [],
        schemaDigest: 'schema-hash',
        functions: [],
        sourceDigest: 'c'.repeat(64),
        secrets: [],
        worker: { vars: {}, bindings: [] },
      },
    },
  };
  assert.deepEqual(validateStagingSnapshot(report, 'a'.repeat(40)), []);
  assert.deepEqual(validateStagingSnapshot(report, 'b'.repeat(40)), [
    'production: staging inventory commit does not match the release commit',
  ]);
  assert.deepEqual(validateStagingSnapshot({ ...report, ok: false }, 'a'.repeat(40)), [
    'production: staging inventory artifact did not pass its release gate',
  ]);
  assert.deepEqual(
    validateStagingSnapshot(
      {
        ...report,
        evidence: {
          ...report.evidence,
          sourceAttestation: { ...report.evidence.sourceAttestation, sourceDigest: 'invalid' },
        },
      },
      'a'.repeat(40),
    ),
    ['production: staging inventory artifact is malformed'],
  );
});

test('fails promotion when source or Supabase CLI release attestations differ', () => {
  const staging = {
    commit: 'a'.repeat(40),
    sourceDigest: 'b'.repeat(64),
    supabaseCliVersion: '2.111.0',
  };
  assert.deepEqual(compareSourceAttestations(staging, { ...staging }), []);
  assert.deepEqual(
    compareSourceAttestations(staging, {
      ...staging,
      sourceDigest: 'c'.repeat(64),
      supabaseCliVersion: '2.112.0',
    }),
    [
      'staging ↔ production: predeploy function source digests differ',
      'staging ↔ production: Supabase CLI release versions differ',
    ],
  );
});
