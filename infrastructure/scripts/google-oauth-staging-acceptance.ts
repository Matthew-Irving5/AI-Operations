import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const correlationIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9:-]{0,127}$/);

const GoogleOAuthChecksSchema = z
  .object({
    accountRole: z.literal('personal_data_source'),
    expectedAccountMatched: z.literal('passed'),
    approvedScopesMatched: z.literal('passed'),
    pickerSelectedDedicatedFile: z.literal('passed'),
    selectedOnlySync: z.literal('passed'),
    idempotencyReplay: z.literal('passed'),
    providerUpdateAppliedOnce: z.literal('passed'),
    selectionRevokeStoppedImport: z.literal('passed'),
    deselectedProvenanceRetained: z.literal('passed'),
    oauthRevokeDegradedWithoutDataLoss: z.literal('passed'),
    reconnectRecoveredSync: z.literal('passed'),
    freshnessRecovered: z.literal('passed'),
    unrelatedResourceUntouched: z.literal('passed'),
  })
  .strict();

const GoogleOAuthEvidenceInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    state: z.literal('GOOGLE_OAUTH_STAGING_ACCEPTED'),
    acceptanceProfile: z.literal('google-oauth'),
    candidateSha: z.string().regex(/^[a-f0-9]{40}$/),
    candidateTreeSha: z.string().regex(/^[a-f0-9]{40}$/),
    pullRequestNumber: z.number().int().positive(),
    deploymentRunId: z.string().regex(/^[1-9][0-9]{0,19}$/),
    stagingOrigin: z.literal('https://ai-operations-staging.ai-operations.workers.dev'),
    humanMfa: z.literal('user-completed'),
    checks: GoogleOAuthChecksSchema,
    resourceFingerprints: z
      .object({
        selectedFile: sha256Schema,
        unselectedFile: sha256Schema,
        deselectedFile: sha256Schema,
      })
      .strict(),
    correlationIds: z.array(correlationIdSchema).min(1).max(20),
    acceptedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type GoogleOAuthStagingEvidence = z.infer<typeof GoogleOAuthEvidenceInputSchema>;

export function fingerprintGoogleResourceId(resourceId: string): string {
  if (!resourceId || resourceId.length > 256) {
    throw new Error('Google resource identifier is missing or invalid.');
  }
  return createHash('sha256').update(resourceId, 'utf8').digest('hex');
}

export function parseGoogleOAuthStagingEvidence(input: unknown): GoogleOAuthStagingEvidence {
  return GoogleOAuthEvidenceInputSchema.parse(input);
}

export async function writeGoogleOAuthStagingEvidence(path: string, input: unknown): Promise<void> {
  const evidence = parseGoogleOAuthStagingEvidence(input);
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
