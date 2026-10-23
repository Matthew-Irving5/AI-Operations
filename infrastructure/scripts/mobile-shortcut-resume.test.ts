import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { parseMobileShortcutResume } from './mobile-shortcut-resume.js';

const validEnvironment = {
  LIVE_E2E_MOBILE_RESUME: 'true',
  LIVE_E2E_MOBILE_RESUME_DEVICE_ID: '474c2be0-1594-413b-b2e3-a9bd16cdf7e6',
  LIVE_E2E_MOBILE_RESUME_DEVICE_LABEL: 'AI28 synthetic c4316d81',
  LIVE_E2E_MOBILE_RESUME_SNAPSHOT_INTERNAL_ID: '63e1e94a-eee4-44d7-9374-c1c96064cc37',
  LIVE_E2E_MOBILE_RESUME_SNAPSHOT_ID: 'cc624b62-dfbe-42fe-8d72-90f8b11f5882',
  LIVE_E2E_MOBILE_RESUME_SNAPSHOT_RECEIVED_AT: '2026-10-23T14:44:24.624987Z',
  LIVE_E2E_MOBILE_RESUME_TOKEN: 'synthetic-local-token-value-long-enough',
  LIVE_E2E_MOBILE_RESUME_PAIRING_MFA: 'user-completed',
  LIVE_E2E_MOBILE_RESUME_SHORTCUT_RUN: 'operator-confirmed',
};

describe('mobile Shortcut resume configuration', () => {
  it('parses an exact existing synthetic fixture and process-local token', () => {
    assert.deepEqual(parseMobileShortcutResume(validEnvironment), {
      deviceId: validEnvironment.LIVE_E2E_MOBILE_RESUME_DEVICE_ID,
      deviceLabel: validEnvironment.LIVE_E2E_MOBILE_RESUME_DEVICE_LABEL,
      snapshotInternalId: validEnvironment.LIVE_E2E_MOBILE_RESUME_SNAPSHOT_INTERNAL_ID,
      snapshotId: validEnvironment.LIVE_E2E_MOBILE_RESUME_SNAPSHOT_ID,
      snapshotReceivedAt: validEnvironment.LIVE_E2E_MOBILE_RESUME_SNAPSHOT_RECEIVED_AT,
      token: validEnvironment.LIVE_E2E_MOBILE_RESUME_TOKEN,
      pairingMfaConfirmation: 'user-completed',
      shortcutRunConfirmation: 'operator-confirmed',
    });
  });

  it('rejects partial resume configuration without echoing the token', () => {
    const token = validEnvironment.LIVE_E2E_MOBILE_RESUME_TOKEN;
    const partial: Record<string, string | undefined> = { ...validEnvironment };
    delete partial.LIVE_E2E_MOBILE_RESUME_SNAPSHOT_ID;

    assert.throws(
      () => parseMobileShortcutResume(partial),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /exact staging fixture metadata/);
        assert.equal(error.message.includes(token), false);
        return true;
      },
    );
  });

  it('rejects resume fields when the mode flag is absent', () => {
    const partial: Record<string, string | undefined> = { ...validEnvironment };
    delete partial.LIVE_E2E_MOBILE_RESUME;
    assert.throws(() => parseMobileShortcutResume(partial), /exact staging fixture metadata/);
  });

  it('requires the prior operator run confirmation for resume mode', () => {
    const partial: Record<string, string | undefined> = { ...validEnvironment };
    delete partial.LIVE_E2E_MOBILE_RESUME_SHORTCUT_RUN;
    assert.throws(() => parseMobileShortcutResume(partial), /exact staging fixture metadata/);
  });

  it('leaves the ordinary fresh-pairing path unchanged when resume fields are absent', () => {
    assert.equal(parseMobileShortcutResume({}), undefined);
  });

  it('resumes only the exact owner-scoped snapshot and keeps the remaining checks', async () => {
    const source = await readFile(
      resolve('tests/e2e-live/mobile-shortcuts-acceptance.spec.ts'),
      'utf8',
    );
    const branchStart = source.indexOf('if (mobileResume) {');
    const freshPairingStart = source.indexOf('} else {', branchStart);
    assert.ok(branchStart >= 0 && freshPairingStart > branchStart);

    const resumeBranch = source.slice(branchStart, freshPairingStart);
    assert.match(resumeBranch, /ownerRows[\s\S]*apple_bridge_devices/);
    assert.match(resumeBranch, /user_id: `eq\.\$\{ownerUserId\}`/);
    assert.match(resumeBranch, /device_id: `eq\.\$\{deviceId\}`/);
    assert.match(resumeBranch, /snapshot_id: `eq\.\$\{mobileResume\.snapshotId\}`/);
    assert.match(resumeBranch, /snapshotInternalId/);
    assert.match(resumeBranch, /snapshotReceivedAt/);
    assert.match(resumeBranch, /shortcutRunConfirmation/);
    assert.doesNotMatch(resumeBranch, /Set up Apple Shortcut bridge|waitForSnapshot/);
    assert.match(source, /if \(!mobileResume\) \{[\s\S]*?confirmShortcutRun/);

    const commonChecks = source.slice(freshPairingStart);
    for (const check of [
      'const staleResult = await mobileRequest',
      'const validResult = await mobileRequest',
      'const replayResult = await mobileRequest',
      'const updatedResult = await mobileRequest',
      'const wrongSchemaResult = await mobileRequest',
      'const retryResult = await mobileRequest',
      'const revokedResult = await mobileRequest',
    ]) {
      assert.ok(commonChecks.includes(check), `Missing remaining acceptance assertion: ${check}`);
    }
  });
});
