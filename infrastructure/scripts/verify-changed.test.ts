import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImpactPlan, playwrightInstallArgs, prettierFiles } from './verify-changed';

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
