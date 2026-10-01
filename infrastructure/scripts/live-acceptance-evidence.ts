import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { createHostedStagingSuiteEvidence } from './release-gate.js';

const EvidenceWriteInputSchema = z
  .object({
    candidateSha: z.string().regex(/^[a-f0-9]{40}$/i),
    candidateTreeSha: z.string().regex(/^[a-f0-9]{40}$/i),
    pullRequestNumber: z.number().int().positive(),
    deploymentRunId: z.string().regex(/^[1-9][0-9]{0,19}$/),
    stagingOrigin: z.literal('https://ai-operations-staging.ai-operations.workers.dev'),
    completeSuite: z.literal('passed'),
    manualMfaChallengeObserved: z.literal(true),
    browserChecks: z
      .object({ chromium: z.literal('passed'), webkit: z.literal('passed') })
      .strict(),
    checks: z
      .object({
        authAal2: z.literal('passed'),
        safeRead: z.literal('passed'),
        safeWrite: z.literal('passed'),
        ui: z.literal('passed'),
        edgeFunctions: z.literal('passed'),
        releaseVersion: z.literal('passed'),
      })
      .strict(),
    correlationIds: z
      .array(z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9:-]{0,127}$/))
      .min(1)
      .max(20),
    acceptedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export async function writeLiveStagingAcceptanceEvidence(
  path: string,
  rawInput: unknown,
): Promise<void> {
  const input = EvidenceWriteInputSchema.parse(rawInput);
  const evidence = createHostedStagingSuiteEvidence({
    schemaVersion: 1,
    state: 'LIVE_STAGING_E2E_ACCEPTED',
    acceptanceProfile: 'auth-browser',
    candidateSha: input.candidateSha,
    candidateTreeSha: input.candidateTreeSha,
    pullRequestNumber: input.pullRequestNumber,
    deploymentRunId: input.deploymentRunId,
    stagingOrigin: input.stagingOrigin,
    humanMfa: 'user-completed',
    checks: input.checks,
    correlationIds: input.correlationIds,
    acceptedAt: input.acceptedAt,
  });
  const temporaryPath = `${path}.tmp-${randomUUID()}`;
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(temporaryPath, `${JSON.stringify(evidence, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

export function resolveGitTreeSha(candidateSha: string): string {
  if (!/^[a-f0-9]{40}$/i.test(candidateSha)) throw new Error('Candidate SHA is invalid.');
  return execFileSync('git', ['rev-parse', '--verify', `${candidateSha}^{tree}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
