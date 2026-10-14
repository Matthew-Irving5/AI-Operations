import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { liveAuthScheduleAction } from './live-auth-schedule-action.js';

const runnerPath = resolve('infrastructure/scripts/run-live-e2e.ts');
const journeyPath = resolve('tests/e2e-live/auth-acceptance.spec.ts');

describe('live auth acceptance harness', () => {
  it('never uses the service role to read user-owned schedules', async () => {
    const runner = await readFile(runnerPath, 'utf8');
    const journey = await readFile(journeyPath, 'utf8');

    assert.doesNotMatch(runner, /rest\/v1\/workflow_schedules/);
    assert.doesNotMatch(runner, /LIVE_E2E_SCHEDULE_ID/);
    assert.doesNotMatch(journey, /readRows<[^>]+>\(\s*['"]workflow_schedules['"]/);
    assert.match(journey, /const scheduleCards = page\.locator\('article\[data-schedule-id\]'\)/);
  });

  it('uses the opposite state action for either owner-visible schedule state', () => {
    assert.deepEqual(liveAuthScheduleAction('Disabled · Europe/London'), {
      initialLabel: 'Disabled',
      nextEnabled: true,
      buttonName: 'Enable schedule (fresh MFA required)',
      confirmationMessage: 'Schedule enabled.',
    });
    assert.deepEqual(liveAuthScheduleAction('Enabled · Europe/London'), {
      initialLabel: 'Enabled',
      nextEnabled: false,
      buttonName: 'Disable schedule (fresh MFA required)',
      confirmationMessage: 'Schedule disabled.',
    });
    assert.throws(() => liveAuthScheduleAction('Unknown'), /status is missing or invalid/);
  });

  it('proves stale denial without an MFA gate before the real fresh-MFA action', async () => {
    const journey = await readFile(journeyPath, 'utf8');

    assert.match(
      journey,
      /const staleRequest = \{ scheduleId: targetSchedule, enabled: scheduleAction\.nextEnabled \}/,
    );
    assert.match(
      journey,
      /usedMfaGate: Object\.prototype\.hasOwnProperty\.call\(body, 'mfaGateId'\)/,
    );
    assert.match(journey, /status: 403, body: \{ code: 'fresh_mfa_required' \}/);
    assert.match(journey, /expect\(staleAttempt\.usedMfaGate\)\.toBe\(false\)/);
    assert.match(
      journey,
      /card\.getByRole\('button', \{ name: scheduleAction\.buttonName \}\)\.click\(\)/,
    );
  });
});
