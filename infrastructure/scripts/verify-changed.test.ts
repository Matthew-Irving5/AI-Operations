import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildImpactPlan,
  playwrightInstallArgs,
  prettierFiles,
  runChecks,
  shellSafeArguments,
} from './verify-changed';

test('release-only changes do not pay browser E2E', () => {
  const plan = buildImpactPlan(['infrastructure/scripts/release-gate.ts']);
  assert.equal(plan.browser, false);
  assert.equal(plan.fullCore, false);
});

test('frontend changes select browser proof', () => {
  const plan = buildImpactPlan(['apps/web/app/page.tsx']);
  assert.equal(plan.browser, true);
  assert.ok(plan.profiles.includes('frontend'));
});

test('database security changes select DB and security proof', () => {
  const plan = buildImpactPlan(['supabase/migrations/20261001_rls_policy.sql']);
  assert.equal(plan.db, true);
  assert.equal(plan.security, true);
});

test('Deno Edge files bypass Prettier and use the Edge formatter lane', () => {
  assert.deepEqual(prettierFiles(['supabase/functions/feedback-submit/index.ts']), []);
  assert.deepEqual(prettierFiles(['apps/web/app/page.tsx']), ['apps/web/app/page.tsx']);
});

test('Windows command arguments preserve route-group paths through cmd.exe', () => {
  const path = 'apps/web/app/(app)/design-system/page.tsx';

  assert.deepEqual(shellSafeArguments(['--check', path], 'win32'), [
    '--check',
    '"apps/web/app/(app)/design-system/page.tsx"',
  ]);
  assert.deepEqual(shellSafeArguments(['--check', path], 'linux'), ['--check', path]);
});

test('clean Linux runners install Chromium system dependencies only when selected', () => {
  assert.deepEqual(playwrightInstallArgs('linux'), [
    'pnpm',
    'exec',
    'playwright',
    'install',
    '--with-deps',
    'chromium',
  ]);
  assert.deepEqual(playwrightInstallArgs('win32'), [
    'pnpm',
    'exec',
    'playwright',
    'install',
    'chromium',
  ]);
});

test('independent changed-surface checks continue and summarize failures without leaking secrets', () => {
  const invoked: string[] = [];
  const output: string[] = [];
  let clock = 0;
  const results = runChecks(
    [
      { name: 'lint', command: 'pnpm lint', execute: () => undefined },
      { name: 'database', command: 'pnpm test:db', execute: () => undefined },
      { name: 'edge tests', command: 'deno test', execute: () => undefined },
    ],
    {
      execute: (check) => {
        invoked.push(check.name);
        if (check.name === 'lint') throw new Error('api_key=very-secret-value');
      },
      now: () => (clock += 5),
      write: (text) => output.push(text),
    },
  );

  assert.deepEqual(invoked, ['lint', 'database', 'edge tests']);
  assert.deepEqual(
    results.map(({ name, status }) => [name, status]),
    [
      ['lint', 'failed'],
      ['database', 'passed'],
      ['edge tests', 'passed'],
    ],
  );
  assert.match(output.join(''), /Check summary: 2 passed, 1 failed, 0 skipped\./);
  assert.match(output.join(''), /pnpm lint/);
  assert.doesNotMatch(output.join(''), /very-secret-value/);
});

test('checks with failed prerequisites are explicitly skipped while unrelated checks still run', () => {
  const invoked: string[] = [];
  const results = runChecks(
    [
      { name: 'Supabase readiness', command: 'supabase start', execute: () => undefined },
      {
        name: 'database tests',
        command: 'pnpm test:db',
        dependencies: ['Supabase readiness'],
        execute: () => undefined,
      },
      { name: 'Edge tests', command: 'deno test', execute: () => undefined },
    ],
    {
      execute: (check) => {
        invoked.push(check.name);
        if (check.name === 'Supabase readiness') throw new Error('Docker engine unavailable');
      },
      write: () => undefined,
    },
  );

  assert.deepEqual(invoked, ['Supabase readiness', 'Edge tests']);
  assert.deepEqual(
    results.map(({ name, status }) => [name, status]),
    [
      ['Supabase readiness', 'failed'],
      ['database tests', 'skipped'],
      ['Edge tests', 'passed'],
    ],
  );
  assert.match(results[1]?.detail ?? '', /prerequisite "Supabase readiness" failed/);
});
