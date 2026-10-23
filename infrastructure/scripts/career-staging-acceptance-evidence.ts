import { randomUUID } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';

const ShaSchema = z.string().regex(/^[a-f0-9]{40}$/i);
const UuidSchema = z.string().uuid();
const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  });
const PositiveCountSchema = z.number().int().positive();
const SourceExtensionSchema = z.enum([
  'c',
  'cc',
  'cpp',
  'cs',
  'css',
  'go',
  'h',
  'html',
  'java',
  'js',
  'jsx',
  'kt',
  'mjs',
  'py',
  'rs',
  'sh',
  'sql',
  'swift',
  'ts',
  'tsx',
]);

const OwnerDenialSchema = z
  .discriminatedUnion('ownerClass', [
    z
      .object({
        ownerClass: z.literal('brightsg'),
        httpStatus: z.literal(403),
        code: z.literal('github_owner_hard_denied'),
        requestId: UuidSchema,
        auditAction: z.literal('github_career_sync_owner_denied'),
        auditTargetType: z.literal('github_owner'),
        auditTargetId: z.literal('hard_denied'),
        auditResult: z.literal('denied'),
        providerRequestMade: z.literal(false),
      })
      .strict(),
    z
      .object({
        ownerClass: z.literal('other'),
        httpStatus: z.literal(403),
        code: z.literal('github_owner_not_allowlisted'),
        requestId: UuidSchema,
        auditAction: z.literal('github_career_sync_owner_denied'),
        auditTargetType: z.literal('github_owner'),
        auditTargetId: z.literal('not_allowlisted'),
        auditResult: z.literal('denied'),
        providerRequestMade: z.literal(false),
      })
      .strict(),
  ])
  .array()
  .length(2)
  .refine(
    (denials) => denials[0]?.ownerClass === 'brightsg' && denials[1]?.ownerClass === 'other',
    'Owner denials must be recorded separately in BrightSG-then-other order.',
  );

export const CareerStagingAcceptanceChecksSchema = z
  .object({
    authenticatedCareerSync: z.literal('passed'),
    personalGithubScope: z.literal('passed'),
    demonstratedSkillCitation: z.literal('passed'),
    brightSgDenied: z.literal('passed'),
    otherOwnerDenied: z.literal('passed'),
    ownerDenialAuditNoProviderRequest: z.literal('passed'),
    chromium: z.literal('passed'),
  })
  .strict();

const CareerProofSchema = z
  .object({
    githubOwner: z.literal('Matthew-Irving5'),
    sync: z
      .object({
        httpStatus: z.literal(200),
        repositories: PositiveCountSchema,
        evidenceRecords: PositiveCountSchema,
        requestId: UuidSchema,
        retrievedAt: z.string().datetime({ offset: true }),
      })
      .strict(),
    skillCitation: z
      .object({
        skillCount: PositiveCountSchema,
        evidenceStrength: z.literal('authored-source-change'),
        mergedDate: DateSchema,
        retrievedDate: DateSchema,
        mergedPullRequestUrlSha256: z.string().regex(/^[a-f0-9]{64}$/),
        sourceFileBlobUrlSha256: z.string().regex(/^[a-f0-9]{64}$/),
        sourceFileExtension: SourceExtensionSchema,
        addedLines: PositiveCountSchema,
      })
      .strict(),
    ownerDenials: OwnerDenialSchema,
  })
  .strict();

export const CareerStagingAcceptanceEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    state: z.literal('CAREER_STAGING_ACCEPTED'),
    acceptanceProfile: z.literal('career'),
    candidateSha: ShaSchema,
    candidateTreeSha: ShaSchema,
    pullRequestNumber: z.number().int().positive(),
    deploymentRunId: z.string().regex(/^[1-9][0-9]{0,19}$/),
    stagingOrigin: z.literal('https://ai-operations-staging.ai-operations.workers.dev'),
    humanMfa: z.literal('user-completed'),
    correlationIds: z.tuple([UuidSchema, UuidSchema, UuidSchema]),
    checks: CareerStagingAcceptanceChecksSchema,
    proof: CareerProofSchema,
    acceptedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .refine((evidence) => {
    const [syncId, brightSgId, otherOwnerId] = evidence.correlationIds;
    const [brightSgDenial, otherOwnerDenial] = evidence.proof.ownerDenials;
    return (
      syncId === evidence.proof.sync.requestId &&
      brightSgId === brightSgDenial?.requestId &&
      otherOwnerId === otherOwnerDenial?.requestId
    );
  }, 'Correlation IDs must bind the sync and both separate owner-denial requests.');

export type CareerStagingAcceptanceEvidence = z.infer<typeof CareerStagingAcceptanceEvidenceSchema>;

export async function writeCareerStagingAcceptanceEvidence(
  path: string,
  rawInput: unknown,
): Promise<void> {
  const evidence = CareerStagingAcceptanceEvidenceSchema.parse(rawInput);
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
