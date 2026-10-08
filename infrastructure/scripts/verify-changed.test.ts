import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildImpactPlan,
  playwrightInstallArgs,
  prettierFiles,
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
