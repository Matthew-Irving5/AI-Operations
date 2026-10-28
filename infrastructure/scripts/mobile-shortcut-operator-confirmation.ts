import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { z } from 'zod';

const confirmationSchema = z.strictObject({
  schemaVersion: z.literal(1),
  confirmation: z.literal('SHORTCUT RUN CONFIRMED'),
  candidateSha: z.string().regex(/^[a-f0-9]{40}$/i),
  candidateTreeSha: z.string().regex(/^[a-f0-9]{40}$/i),
  deviceId: z.string().uuid(),
  snapshotId: z.string().uuid(),
});

export type MobileShortcutOperatorConfirmationContext = {
  candidateSha: string;
  candidateTreeSha: string;
  deviceId: string;
  snapshotId: string;
};

export async function waitForMobileShortcutOperatorConfirmation(input: {
  markerPath: string;
  expected: MobileShortcutOperatorConfirmationContext;
  timeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<void> {
  const markerPath = resolve(input.markerPath);
  const resultsDirectory = resolve('test-results');
  const relativeMarkerPath = relative(resultsDirectory, markerPath);
  if (
    relativeMarkerPath === '' ||
    relativeMarkerPath === '..' ||
    relativeMarkerPath.startsWith(`..${sep}`) ||
    isAbsolute(relativeMarkerPath)
  ) {
    throw new Error('Shortcut operator confirmation marker must be inside test-results/.');
  }

  const timeoutMs = input.timeoutMs ?? 120_000;
  const pollIntervalMs = input.pollIntervalMs ?? 250;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5 * 60_000) {
    throw new Error('Shortcut operator confirmation timeout is invalid.');
  }
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 1 || pollIntervalMs > 5_000) {
    throw new Error('Shortcut operator confirmation polling interval is invalid.');
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    let contents: string | undefined;
    try {
      contents = await readFile(markerPath, 'utf8');
    } catch (error) {
      if (
        typeof error !== 'object' ||
        error === null ||
        !('code' in error) ||
        error.code !== 'ENOENT'
      ) {
        throw new Error('Unable to read the Shortcut operator confirmation marker.');
      }
    }

    if (contents !== undefined) {
      let value: unknown;
      try {
        value = JSON.parse(contents);
      } catch {
        throw new Error('Shortcut operator confirmation marker is not valid JSON.');
      }
      const parsed = confirmationSchema.safeParse(value);
      if (!parsed.success) {
        throw new Error('Shortcut operator confirmation marker does not match its schema.');
      }
      const expected = input.expected;
      if (
        parsed.data.candidateSha.toLowerCase() !== expected.candidateSha.toLowerCase() ||
        parsed.data.candidateTreeSha.toLowerCase() !== expected.candidateTreeSha.toLowerCase() ||
        parsed.data.deviceId.toLowerCase() !== expected.deviceId.toLowerCase() ||
        parsed.data.snapshotId.toLowerCase() !== expected.snapshotId.toLowerCase()
      ) {
        throw new Error(
          'Shortcut operator confirmation marker does not match this acceptance run.',
        );
      }
      return;
    }

    if (Date.now() < deadline) {
      await new Promise((done) =>
        setTimeout(done, Math.min(pollIntervalMs, deadline - Date.now())),
      );
    }
  }

  throw new Error('Timed out waiting for the matching Shortcut operator confirmation marker.');
}
