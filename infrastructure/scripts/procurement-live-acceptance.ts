import { randomUUID } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';

const HostnameSchema = z
  .string()
  .regex(
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/,
  );

const ProcurementRunEvidenceSchema = z
  .object({
    researchRunId: z.string().uuid(),
    workflowRunId: z.string().uuid(),
    correlationId: z.string().uuid(),
    status: z.literal('complete'),
    hardCapMicroUsd: z.literal(250_000),
    actualCostMicroUsd: z.number().int().nonnegative().max(250_000),
    searchLimit: z.literal(3),
    searchesUsed: z.number().int().min(1).max(3),
    aiCallCount: z.number().int().min(1).max(20),
  })
  .strict();

const DatedOfferEvidenceSchema = z
  .object({
    candidateId: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
    sourceHost: HostnameSchema,
    observedAt: z.string().datetime({ offset: true }),
    totalMinor: z.number().int().nonnegative().safe(),
  })
  .strict();

export const ProcurementStagingAcceptanceChecksSchema = z
  .object({
    releaseVersion: z.literal('passed'),
    requirementsPersistedBeforeRanking: z.literal('passed'),
    eligibilityAndUnknownHandling: z.literal('passed'),
    allInTotalsAndDatedConflictingSources: z.literal('passed'),
    revisionPreservesPriorProvenance: z.literal('passed'),
    persistedRationale: z.literal('passed'),
    purchasePaymentDenied: z.literal('passed'),
    chromium: z.literal('passed'),
  })
  .strict();

export const ProcurementStagingAcceptanceEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    state: z.literal('PROCUREMENT_STAGING_ACCEPTED'),
    acceptanceProfile: z.literal('procurement'),
    candidateSha: z.string().regex(/^[a-f0-9]{40}$/i),
    candidateTreeSha: z.string().regex(/^[a-f0-9]{40}$/i),
    pullRequestNumber: z.number().int().positive(),
    deploymentRunId: z.string().regex(/^[1-9][0-9]{0,19}$/),
    stagingOrigin: z.literal('https://ai-operations-staging.ai-operations.workers.dev'),
    humanMfa: z.literal('user-completed'),
    correlationIds: z.array(z.string().uuid()).length(2),
    acceptedAt: z.string().datetime({ offset: true }),
    checks: ProcurementStagingAcceptanceChecksSchema,
    runs: z.array(ProcurementRunEvidenceSchema).length(2),
    revision: z
      .object({
        originalResearchRunId: z.string().uuid(),
        revisedResearchRunId: z.string().uuid(),
        linkedToOriginal: z.literal(true),
        priorDecisionPreserved: z.literal(true),
        requirementsChanged: z.literal(true),
        priorDecisionSha256: z.string().regex(/^[a-f0-9]{64}$/i),
      })
      .strict(),
    comparison: z
      .object({
        requirements: z
          .array(
            z.discriminatedUnion('kind', [
              z
                .object({
                  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
                  kind: z.literal('hard'),
                })
                .strict(),
              z
                .object({
                  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
                  kind: z.literal('preference'),
                })
                .strict(),
            ]),
          )
          .min(1),
        ineligibleCandidateId: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
        exclusionReasonCount: z.number().int().min(1).max(25),
        exclusionReasonsSha256: z.string().regex(/^[a-f0-9]{64}$/i),
        unknownCandidateId: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
        unknownRequirementId: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
        sourceA: DatedOfferEvidenceSchema,
        sourceB: DatedOfferEvidenceSchema,
        currency: z.string().regex(/^[A-Z]{3}$/),
        allIn: z
          .object({
            itemMinor: z.number().int().nonnegative().safe(),
            deliveryMinor: z.number().int().nonnegative().safe(),
            accessoriesMinor: z.number().int().nonnegative().safe(),
            mandatoryFeesMinor: z.number().int().nonnegative().safe(),
            totalMinor: z.number().int().nonnegative().safe(),
          })
          .strict(),
        rationaleSha256: z.string().regex(/^[a-f0-9]{64}$/i),
      })
      .strict(),
    actionDenial: z
      .object({
        status: z.literal(400),
        code: z.literal('invalid_launch_request'),
        noWorkflowCreated: z.literal(true),
      })
      .strict(),
  })
  .strict()
  .superRefine((evidence, context) => {
    if (
      evidence.runs[0]?.researchRunId === evidence.runs[1]?.researchRunId ||
      evidence.runs[0]?.workflowRunId === evidence.runs[1]?.workflowRunId
    ) {
      context.addIssue({ code: 'custom', message: 'procurement_runs_must_be_distinct' });
    }
    if (
      evidence.correlationIds[0] !== evidence.runs[0]?.correlationId ||
      evidence.correlationIds[1] !== evidence.runs[1]?.correlationId ||
      evidence.correlationIds[0] === evidence.correlationIds[1]
    ) {
      context.addIssue({ code: 'custom', message: 'procurement_correlation_ids_must_match_runs' });
    }
    if (
      evidence.revision.originalResearchRunId !== evidence.runs[0]?.researchRunId ||
      evidence.revision.revisedResearchRunId !== evidence.runs[1]?.researchRunId
    ) {
      context.addIssue({ code: 'custom', message: 'procurement_revision_run_link_mismatch' });
    }
    const actualCostMicroUsd = evidence.runs.reduce(
      (total, run) => total + BigInt(run.actualCostMicroUsd),
      0n,
    );
    if (actualCostMicroUsd > 500_000n) {
      context.addIssue({ code: 'custom', message: 'procurement_acceptance_cost_cap_exceeded' });
    }
    const { allIn, sourceA, sourceB } = evidence.comparison;
    const calculatedAllIn =
      BigInt(allIn.itemMinor) +
      BigInt(allIn.deliveryMinor) +
      BigInt(allIn.accessoriesMinor) +
      BigInt(allIn.mandatoryFeesMinor);
    if (calculatedAllIn !== BigInt(allIn.totalMinor)) {
      context.addIssue({ code: 'custom', message: 'procurement_all_in_total_mismatch' });
    }
    if (sourceA.candidateId === sourceB.candidateId || sourceA.totalMinor === sourceB.totalMinor) {
      context.addIssue({ code: 'custom', message: 'procurement_comparison_evidence_not_distinct' });
    }
  });

export type ProcurementStagingAcceptanceEvidence = z.infer<
  typeof ProcurementStagingAcceptanceEvidenceSchema
>;

export async function writeProcurementStagingAcceptanceEvidence(
  path: string,
  rawEvidence: unknown,
): Promise<void> {
  const evidence = ProcurementStagingAcceptanceEvidenceSchema.parse(rawEvidence);
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
