import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { describe, it } from 'node:test';
import { waitForMobileShortcutOperatorConfirmation } from './mobile-shortcut-operator-confirmation.js';

const expected = {
  candidateSha: 'a'.repeat(40),
  candidateTreeSha: 'b'.repeat(40),
  deviceId: '00000000-0000-4000-8000-000000000001',
  snapshotId: '00000000-0000-4000-8000-000000000002',
};

describe('mobile Shortcut operator confirmation', () => {
  it('uses the candidate/device/snapshot marker before the Playwright TTY fallback', async () => {
    const source = await readFile(
      resolve('tests/e2e-live/mobile-shortcuts-acceptance.spec.ts'),
      'utf8',
    );
    const confirmation = source.slice(
      source.indexOf('async function confirmShortcutRun'),
      source.indexOf("test('AI-28 mobile Shortcut staging acceptance'"),
    );
    const markerBranch = confirmation.indexOf('if (markerPath)');
    const markerWait = confirmation.indexOf('waitForMobileShortcutOperatorConfirmation');
    const ttyFallback = confirmation.indexOf('if (!process.stdin.isTTY || !process.stdout.isTTY)');

    assert.ok(markerBranch >= 0 && markerWait > markerBranch && ttyFallback > markerWait);
    assert.match(source, /snapshotId: shortcutSnapshot\.snapshot_id/);
  });

  it('accepts a matching parent marker when the Playwright worker has no TTY', async () => {
    await mkdir(resolve('test-results'), { recursive: true });
    const directory = await mkdtemp(join(resolve('test-results'), 'shortcut-confirmation-'));
    const markerPath = join(directory, 'confirmation.json');
    try {
      await writeFile(
        markerPath,
        JSON.stringify({
          schemaVersion: 1,
          confirmation: 'SHORTCUT RUN CONFIRMED',
          ...expected,
        }),
      );

      await waitForMobileShortcutOperatorConfirmation({
        markerPath,
        expected,
        timeoutMs: 100,
        pollIntervalMs: 1,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects a marker from a previous device, snapshot, or candidate', async () => {
    await mkdir(resolve('test-results'), { recursive: true });
    const directory = await mkdtemp(join(resolve('test-results'), 'shortcut-confirmation-'));
    const markerPath = join(directory, 'confirmation.json');
    try {
      for (const mismatch of [
        { deviceId: '00000000-0000-4000-8000-000000000003' },
        { snapshotId: '00000000-0000-4000-8000-000000000003' },
        { candidateSha: 'c'.repeat(40) },
        { candidateTreeSha: 'd'.repeat(40) },
      ]) {
        await writeFile(
          markerPath,
          JSON.stringify({
            schemaVersion: 1,
            confirmation: 'SHORTCUT RUN CONFIRMED',
            ...expected,
            ...mismatch,
          }),
        );
        await assert.rejects(
          waitForMobileShortcutOperatorConfirmation({ markerPath, expected, timeoutMs: 100 }),
          /does not match this acceptance run/,
        );
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects marker paths outside ignored test-results output', async () => {
    await mkdir(resolve('test-results'), { recursive: true });
    await assert.rejects(
      waitForMobileShortcutOperatorConfirmation({
        markerPath: resolve('outside-confirmation.json'),
        expected,
      }),
      /must be inside test-results/,
    );
  });
});
