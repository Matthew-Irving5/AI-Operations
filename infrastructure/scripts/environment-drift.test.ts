import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localFunctionDirectories } from './edge-function-inventory.js';
import {
  compareInventory,
  compareWorkerToExpected,
  compareMigrations,
  compareSourceAttestations,
  compareSourceDigests,
  migrationVersionFromFilename,
  parseAuthManifest,
  parseFunctionAuth,
  validateAuthManifest,
  sourceFileDigests,
  validateConfig,
  missingGitHubEnvironmentNames,
  validateStagingSnapshot,
  inventoryFromWrangler,
  generatedTypesMatch,
  type FunctionInventory,
  type WorkerInventory,
} from './environment-drift.js';

function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

test('generated database types compare across newline conventions but retain content drift', () => {
  const generated = 'export type Database = {\n  public: {};\n};\n';
  const checkedIn = generated.replaceAll('\n', '\r\n');

  assert.equal(generatedTypesMatch(generated, checkedIn), true);
  assert.equal(generatedTypesMatch(generated, `${checkedIn}// changed type\r\n`), false);
});

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

test('permits only the documented AI-15 staging-only WORKER_SECRET exception', () => {
  const withoutWorkerSecret = {
    ...inventory,
    secrets: inventory.secrets.filter((name) => name !== 'WORKER_SECRET'),
  };
  const approved = { stagingOnly: ['WORKER_SECRET'], productionOnly: [] };
  assert.deepEqual(
    compareInventory(
      { ...inventory, secrets: [...inventory.secrets, 'WORKER_SECRET'] },
      withoutWorkerSecret,
      ['staging', 'production'],
      approved,
    ),
    [],
  );
  assert.ok(
    compareInventory(
      { ...inventory, secrets: [...inventory.secrets, 'UNEXPECTED_SECRET'] },
      withoutWorkerSecret,
      ['staging', 'production'],
      approved,
    ).some((mismatch) => mismatch.includes('outside the approved environment-specific exception')),
  );
  assert.ok(
    compareInventory(
      inventory,
      { ...withoutWorkerSecret, secrets: [...withoutWorkerSecret.secrets, 'WORKER_SECRET'] },
      ['staging', 'production'],
      approved,
    ).some((mismatch) => mismatch.includes('outside the approved environment-specific exception')),
  );
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

test('maps every local Edge Function to configured or default JWT verification', () => {
  const directories = localFunctionDirectories();
  assert.ok(!directories.includes('node_modules'));
  const auth = parseFunctionAuth(readFileSync('supabase/config.toml', 'utf8'), directories);
  assert.equal(auth.size, directories.length);
  assert.deepEqual([...auth.keys()].sort(), directories);
  assert.equal(auth.get('notification-test'), true);
  assert.equal(auth.get('onboarding-update'), true);
  assert.equal(auth.get('personal-profile'), false);
});

test('auth manifest covers every function and matches explicit platform JWT settings', () => {
  const directories = localFunctionDirectories();
  const config = readFileSync('supabase/config.toml', 'utf8');
  const configuredAuth = parseFunctionAuth(config, directories);
  const contracts = parseAuthManifest(
    readFileSync('supabase/functions/_shared/auth-manifest.json', 'utf8'),
  );
  assert.equal(contracts.length, directories.length);
  assert.deepEqual(validateAuthManifest(contracts, directories, configuredAuth, config), []);
  assert.ok(contracts.every((contract) => contract.principal && contract.identitySource));
  assert.ok(
    contracts
      .filter((contract) => !contract.verifyJwt)
      .every((contract) => contract.rationale.length > 20),
  );
});

test('auth manifest rejects missing, unlisted, and changed auth contracts', () => {
  const contracts = parseAuthManifest(
    readFileSync('supabase/functions/_shared/auth-manifest.json', 'utf8'),
  );
  const directories = localFunctionDirectories();
  const config = readFileSync('supabase/config.toml', 'utf8');
  const configuredAuth = parseFunctionAuth(config, directories);
  const missing = contracts.filter((contract) => contract.slug !== 'manager-list');
  assert.ok(
    validateAuthManifest(missing, directories, configuredAuth, config).some((value) =>
      value.includes('manager-list is missing from the auth manifest'),
    ),
  );
  assert.throws(() =>
    parseAuthManifest(
      JSON.stringify({
        version: 1,
        functions: [contracts[0], contracts[0]],
      }),
    ),
  );
  assert.ok(
    validateAuthManifest(
      contracts.map((contract) =>
        contract.slug === 'manager-list' ? { ...contract, verifyJwt: false } : contract,
      ),
      directories,
      configuredAuth,
      config,
    ).some((value) => value.includes('manager-list auth manifest verifyJwt differs')),
  );
  assert.ok(
    validateAuthManifest(
      contracts,
      directories,
      configuredAuth,
      config.replace(
        /\[functions\.manager-list\]\r?\nverify_jwt = true/,
        '[functions.manager-list]',
      ),
    ).some((value) => value.includes('manager-list must declare verify_jwt explicitly')),
  );
});

test('Edge Functions use the locked Supabase SDK npm graph instead of esm.sh', () => {
  const sourceFiles: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && /\.(?:ts|tsx|js|jsx)$/.test(entry.name)) {
        sourceFiles.push(path);
      }
    }
  };
  visit('supabase/functions');
  const esmMirrorImports = sourceFiles.filter((path) =>
    readFileSync(path, 'utf8').includes('https://esm.sh/@supabase/supabase-js@2.57.0'),
  );
  assert.deepEqual(esmMirrorImports, []);

  const lock = JSON.parse(readFileSync('supabase/functions/deno.lock', 'utf8')) as {
    specifiers: Record<string, string>;
    npm: Record<string, unknown>;
  };
  assert.equal(lock.specifiers['npm:@supabase/supabase-js@2.57.0'], '2.57.0');
  assert.ok(lock.npm['@supabase/storage-js@2.117.2']);
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
    writeFileSync(join(root, '_shared', 'auth-manifest.json'), '{"version":1}\n');
    writeFileSync(join(root, '_shared', 'contract_test.ts'), 'test-only fixture');
    writeFileSync(join(root, '_shared', 'unused.ts'), 'not included by any runtime import');
    const expected = sourceFileDigests(root);
    const deployed = { ...expected, '_shared/contract.ts': 'different-digest' };
    assert.deepEqual(compareSourceDigests(expected, deployed), ['_shared/contract.ts']);
    assert.equal(Object.hasOwn(expected, '_shared/contract_test.ts'), false);
    assert.equal(Object.hasOwn(expected, '_shared/auth-manifest.json'), true);
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

test('validates the deployed RELEASE_SHA by hash while preserving strict Worker drift checks', () => {
  const releaseSha = 'a'.repeat(40);
  const configured = inventoryFromWrangler('staging');
  const live: WorkerInventory = {
    ...configured,
    vars: { ...configured.vars, RELEASE_SHA: hashValue(releaseSha) },
  };

  assert.deepEqual(compareWorkerToExpected('staging', live, releaseSha), []);
  assert.deepEqual(compareWorkerToExpected('staging', configured, releaseSha), [
    'staging: Cloudflare runtime configuration differs from apps/web/wrangler.jsonc',
  ]);
  assert.deepEqual(
    compareWorkerToExpected(
      'staging',
      { ...live, vars: { ...live.vars, RELEASE_SHA: hashValue('b'.repeat(40)) } },
      releaseSha,
    ),
    ['staging: Cloudflare runtime configuration differs from apps/web/wrangler.jsonc'],
  );
  assert.deepEqual(
    compareWorkerToExpected(
      'staging',
      { ...live, vars: { ...live.vars, UNEXPECTED: hashValue('unexpected') } },
      releaseSha,
    ),
    ['staging: Cloudflare runtime configuration differs from apps/web/wrangler.jsonc'],
  );
  assert.deepEqual(compareWorkerToExpected('staging', live, 'not-a-release-sha'), [
    'staging: release SHA is invalid',
  ]);
  assert.equal(
    JSON.stringify(compareWorkerToExpected('staging', live, releaseSha)).includes(releaseSha),
    false,
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
