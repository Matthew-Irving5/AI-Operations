import { readFileSync } from 'node:fs';
import { z } from 'zod';

const ShaSchema = z
  .string()
  .regex(/^[a-f0-9]{40}$/i)
  .transform((value) => value.toLowerCase());
const RunIdSchema = z.string().regex(/^[1-9][0-9]{0,19}$/);
const SafeIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9:-]{0,127}$/);
const DiagnosticCodeSchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
const StageOrigin = z.literal('https://ai-operations-staging.ai-operations.workers.dev');

const StagingDeploymentSchema = z
  .object({
    candidateSha: ShaSchema,
    runId: RunIdSchema,
    origin: StageOrigin,
    workerVersion: SafeIdSchema,
    migrations: z.literal('passed'),
    edgeFunctions: z.literal('passed'),
    sourceDrift: z.literal('passed'),
    readinessSmoke: z.literal('passed'),
  })
  .strict();

const ReadyEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    state: z.literal('STAGING_READY_FOR_ACCEPTANCE'),
    candidateSha: ShaSchema,
    candidateTreeSha: ShaSchema,
    prNumber: z.number().int().positive(),
    localQa: z.literal('passed'),
    ci: z.literal('passed'),
    deployment: StagingDeploymentSchema,
  })
  .strict();

const CapabilityResultsSchema = z
  .object({
    authAal2: z.literal('passed'),
    safeRead: z.literal('passed'),
    safeWrite: z.literal('passed'),
    ui: z.literal('passed'),
    migrations: z.literal('passed'),
    edgeFunctions: z.literal('passed'),
    releaseVersion: z.literal('passed'),
  })
  .strict();

const AcceptanceEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    state: z.literal('STAGING_ACCEPTED'),
    candidateSha: ShaSchema,
    candidateTreeSha: ShaSchema,
    pullRequestNumber: z.number().int().positive(),
    deploymentRunId: RunIdSchema,
    stagingOrigin: StageOrigin,
    humanMfa: z.literal('user-completed'),
    checks: CapabilityResultsSchema,
    correlationIds: z.array(SafeIdSchema).max(20),
    acceptedAt: z.string().datetime({ offset: true }),
    accepted: z.literal(true),
  })
  .strict();

const PromotionEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    state: z.literal('PRODUCTION_PROMOTION_READY'),
    candidateSha: ShaSchema,
    candidateTreeSha: ShaSchema,
    pullRequestNumber: z.number().int().positive(),
    mergeCommitSha: ShaSchema,
    mergeCommitTreeSha: ShaSchema,
    requestedSha: ShaSchema,
    stagingDeploymentRunId: RunIdSchema,
  })
  .strict();

const ProductionSmokeSchema = z
  .object({
    schemaVersion: z.literal(1),
    state: z.enum(['PRODUCTION_ACCEPTED', 'ACTION_REQUIRED']),
    deployedSha: ShaSchema,
    probes: z.array(
      z
        .object({
          name: z.enum(['workerVersion', 'loginShell', 'authBoundary', 'safeFunction']),
          result: z.enum(['passed', 'failed']),
          diagnosticCode: DiagnosticCodeSchema.optional(),
          observedReleaseSha: ShaSchema.optional(),
        })
        .strict(),
    ),
    failures: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)).max(10),
  })
  .strict();

const StagingReadyInputSchema = z
  .object({
    candidateSha: ShaSchema,
    pullRequestHeadSha: ShaSchema,
    candidateTreeSha: ShaSchema,
    pullRequestTreeSha: ShaSchema,
    prNumber: z.number().int().positive(),
    localQa: z.enum(['passed', 'failed']),
    ci: z.enum(['passed', 'failed']),
    deployment: StagingDeploymentSchema,
  })
  .strict();

const StagingAcceptanceInputSchema = z
  .object({
    candidateSha: ShaSchema,
    deploymentRunId: RunIdSchema,
    stagingOrigin: StageOrigin,
    humanMfa: z.literal('user-completed'),
    checks: CapabilityResultsSchema,
    correlationIds: z.array(SafeIdSchema).max(20),
    acceptedAt: z.string().datetime({ offset: true }),
  })
  .strict();
const CandidateStagingDeploymentEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    state: z.literal('CANDIDATE_STAGING_DEPLOYED'),
    candidateSha: ShaSchema,
    candidateTreeSha: ShaSchema,
    pullRequestNumber: z.number().int().positive(),
    runId: RunIdSchema,
    runAttempt: RunIdSchema,
    origin: StageOrigin,
    migrations: z.literal('passed'),
    edgeFunctions: z.literal('passed'),
    sourceDrift: z.literal('passed'),
    readinessSmoke: z.literal('passed'),
  })
  .strict();
const HostedStagingSuiteEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    state: z.literal('LIVE_STAGING_E2E_ACCEPTED'),
    candidateSha: ShaSchema,
    candidateTreeSha: ShaSchema,
    pullRequestNumber: z.number().int().positive(),
    deploymentRunId: RunIdSchema,
    stagingOrigin: StageOrigin,
    humanMfa: z.literal('user-completed'),
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
    correlationIds: z.array(SafeIdSchema).min(1).max(20),
    acceptedAt: z.string().datetime({ offset: true }),
  })
  .strict();

const StagingAcceptanceCommandSchema = z
  .object({
    ready: ReadyEvidenceSchema,
    currentPullRequestHeadSha: ShaSchema,
    currentPullRequestTreeSha: ShaSchema,
    currentPullRequestNumber: z.number().int().positive(),
    acceptance: StagingAcceptanceInputSchema,
  })
  .strict();

const ProductionPromotionInputSchema = z
  .object({
    requestedSha: ShaSchema,
    mergeCommitSha: ShaSchema,
    mergeCommitTreeSha: ShaSchema,
    repositoryFullName: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    associatedPullRequests: z.array(
      z
        .object({
          number: z.number().int().positive(),
          state: z.enum(['open', 'closed']),
          mergedAt: z.string().datetime({ offset: true }).nullable(),
          mergeCommitSha: ShaSchema.nullable(),
          headSha: ShaSchema,
          baseBranch: z.string().min(1),
          headRepositoryFullName: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
        })
        .strict(),
    ),
    acceptance: AcceptanceEvidenceSchema,
  })
  .strict();

const ProductionSmokeInputSchema = z
  .object({
    deployedSha: ShaSchema,
    promotion: PromotionEvidenceSchema,
    probes: ProductionSmokeSchema.shape.probes,
  })
  .strict();

const RequiredCandidateChecks = [
  'CI',
  'Database',
  'Edge functions',
  'E2E',
  'Security',
  'Performance',
  'Windows worker foundation',
  'CodeQL Advanced',
  'Dependency review',
] as const;
const CandidateCheckNameSchema = z.enum(RequiredCandidateChecks);
const CandidateReadinessInputSchema = z
  .object({
    candidateSha: ShaSchema,
    pullRequestHeadSha: ShaSchema,
    prNumber: z.number().int().positive(),
    baseBranch: z.literal('main'),
    sameRepository: z.literal(true),
    pullRequestOpen: z.literal(true),
    checks: z.array(
      z
        .object({
          name: CandidateCheckNameSchema,
          headSha: ShaSchema,
          conclusion: z.enum(['success', 'failure', 'cancelled', 'skipped', 'pending']),
        })
        .strict(),
    ),
  })
  .strict();
const WorkflowRunSchema = z
  .object({
    name: z.string().min(1),
    event: z.string(),
    head_sha: ShaSchema,
    status: z.string(),
    conclusion: z.string().nullable(),
    run_number: z.number().int().positive(),
    run_attempt: z.number().int().positive(),
    run_started_at: z.string().datetime({ offset: true }).nullable().optional(),
    id: z.number().int().positive(),
  })
  .passthrough();
const LatestRequiredWorkflowRunsInputSchema = z
  .object({
    candidateSha: ShaSchema,
    workflowRuns: z.array(WorkflowRunSchema),
  })
  .strict();
const StagingSlotGuardInputSchema = z
  .object({
    candidateSha: ShaSchema,
    repositoryFullName: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    pullRequests: z.array(
      z
        .object({
          number: z.number().int().positive(),
          state: z.enum(['open', 'closed']),
          baseBranch: z.string(),
          headRepositoryFullName: z
            .string()
            .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
            .nullable(),
          headSha: ShaSchema,
          statuses: z.array(
            z
              .object({
                context: z.string(),
                state: z.enum(['error', 'failure', 'pending', 'success']),
                description: z.string().nullable(),
                created_at: z.string().datetime({ offset: true }),
              })
              .passthrough(),
          ),
        })
        .strict(),
    ),
  })
  .strict();
const StagingStatusInputSchema = z.discriminatedUnion('state', [
  z
    .object({
      candidateSha: ShaSchema,
      currentPullRequestHeadSha: ShaSchema,
      state: z.literal('pending'),
      phase: z.enum(['required_checks', 'staging_deployment', 'hosted_acceptance']),
    })
    .strict(),
  z
    .object({
      candidateSha: ShaSchema,
      currentPullRequestHeadSha: ShaSchema,
      state: z.literal('failure'),
      failureCode: z.enum([
        'pr_checks_failed',
        'staging_slot_busy',
        'stage_deployment_failed',
        'acceptance_missing',
        'acceptance_malformed',
        'capability_failed',
        'stale_candidate',
      ]),
    })
    .strict(),
  z
    .object({
      candidateSha: ShaSchema,
      currentPullRequestHeadSha: ShaSchema,
      currentPullRequestTreeSha: ShaSchema,
      currentPullRequestNumber: z.number().int().positive(),
      state: z.literal('success'),
      deployment: CandidateStagingDeploymentEvidenceSchema,
      hostedSuite: HostedStagingSuiteEvidenceSchema,
    })
    .strict(),
]);

export interface CandidateReadinessEvidence {
  schemaVersion: 1;
  state: 'CANDIDATE_READY_FOR_STAGING';
  candidateSha: string;
  prNumber: number;
  checks: Array<{ name: (typeof RequiredCandidateChecks)[number]; conclusion: 'success' }>;
}

export type HostedStagingSuiteEvidence = z.infer<typeof HostedStagingSuiteEvidenceSchema>;

export function createHostedStagingSuiteEvidence(input: unknown): HostedStagingSuiteEvidence {
  return parseEvidence(
    HostedStagingSuiteEvidenceSchema,
    input,
    'staging.hosted_e2e',
    'unknown',
    'valid redacted headed staging acceptance evidence',
  );
}

export interface StagingAcceptanceStatusEvidence {
  candidateSha: string;
  status: {
    state: 'pending' | 'failure' | 'success';
    context: 'AI Operations / Staging capability acceptance';
    description: string;
  };
  acceptance?: StagingAcceptanceEvidence;
}

export type StagingDeploymentEvidence = z.infer<typeof StagingDeploymentSchema>;
export type StagingReadyEvidence = z.infer<typeof ReadyEvidenceSchema>;
export type StagingAcceptanceEvidence = z.infer<typeof AcceptanceEvidenceSchema>;
export type ProductionPromotionEvidence = z.infer<typeof PromotionEvidenceSchema>;
export type ProductionSmokeEvidence = z.infer<typeof ProductionSmokeSchema>;
export type ReleaseGateCommand =
  | 'candidate-readiness'
  | 'staging-status'
  | 'staging-ready'
  | 'staging-accept'
  | 'production-promote'
  | 'production-smoke';

export interface ReleaseGateCommandResult {
  exitCode: 0 | 1;
  evidence:
    | CandidateReadinessEvidence
    | StagingAcceptanceStatusEvidence
    | StagingReadyEvidence
    | StagingAcceptanceEvidence
    | ProductionPromotionEvidence
    | ProductionSmokeEvidence;
}

export function createStagingAcceptanceStatus(input: unknown): StagingAcceptanceStatusEvidence {
  const parsed = parseEvidence(
    StagingStatusInputSchema,
    input,
    'staging.status',
    'unknown',
    'valid staging acceptance status transition',
  );
  const candidateSha = parsed.candidateSha;
  if (parsed.currentPullRequestHeadSha !== candidateSha)
    fail(
      'stale_candidate',
      'staging.status',
      candidateSha,
      candidateSha,
      parsed.currentPullRequestHeadSha,
    );
  if (
    parsed.state === 'success' &&
    parsed.currentPullRequestTreeSha !== parsed.deployment.candidateTreeSha
  )
    fail(
      'candidate_tree_mismatch',
      'staging.status',
      candidateSha,
      parsed.deployment.candidateTreeSha,
      parsed.currentPullRequestTreeSha,
    );
  if (
    parsed.state === 'success' &&
    parsed.currentPullRequestNumber !== parsed.deployment.pullRequestNumber
  )
    fail(
      'pr_number_mismatch',
      'staging.status',
      candidateSha,
      String(parsed.deployment.pullRequestNumber),
      String(parsed.currentPullRequestNumber),
    );

  if (parsed.state === 'pending')
    return {
      candidateSha,
      status: {
        state: 'pending',
        context: 'AI Operations / Staging capability acceptance',
        description:
          parsed.phase === 'required_checks'
            ? 'Required pull request checks are incomplete.'
            : parsed.phase === 'staging_deployment'
              ? 'Candidate staging deployment is in progress.'
              : 'Staging is deployed; waiting for hosted acceptance.',
      },
    };
  if (parsed.state === 'failure')
    return {
      candidateSha,
      status: {
        state: 'failure',
        context: 'AI Operations / Staging capability acceptance',
        description: `Staging acceptance failed: ${parsed.failureCode}.`,
      },
    };

  if (parsed.deployment.candidateSha !== candidateSha)
    fail(
      'deployment_sha_mismatch',
      'staging.status',
      candidateSha,
      candidateSha,
      parsed.deployment.candidateSha,
    );
  if (parsed.hostedSuite.candidateSha !== candidateSha)
    fail(
      'acceptance_sha_mismatch',
      'staging.status',
      candidateSha,
      candidateSha,
      parsed.hostedSuite.candidateSha,
    );
  if (parsed.hostedSuite.deploymentRunId !== parsed.deployment.runId)
    fail(
      'deployment_run_mismatch',
      'staging.status',
      candidateSha,
      parsed.deployment.runId,
      parsed.hostedSuite.deploymentRunId,
    );
  if (parsed.hostedSuite.stagingOrigin !== parsed.deployment.origin)
    fail(
      'staging_origin_mismatch',
      'staging.status',
      candidateSha,
      parsed.deployment.origin,
      parsed.hostedSuite.stagingOrigin,
    );
  const acceptance = AcceptanceEvidenceSchema.parse({
    schemaVersion: 1,
    state: 'STAGING_ACCEPTED',
    candidateSha,
    candidateTreeSha: parsed.deployment.candidateTreeSha,
    pullRequestNumber: parsed.deployment.pullRequestNumber,
    deploymentRunId: parsed.deployment.runId,
    stagingOrigin: parsed.deployment.origin,
    humanMfa: parsed.hostedSuite.humanMfa,
    checks: { ...parsed.hostedSuite.checks, migrations: parsed.deployment.migrations },
    correlationIds: parsed.hostedSuite.correlationIds,
    acceptedAt: parsed.hostedSuite.acceptedAt,
    accepted: true,
  });
  return {
    candidateSha,
    status: {
      state: 'success',
      context: 'AI Operations / Staging capability acceptance',
      description: 'Manual hosted staging capability acceptance passed.',
    },
    acceptance,
  };
}

export function createCandidateReadinessEvidence(input: unknown): CandidateReadinessEvidence {
  const parsed = parseEvidence(
    CandidateReadinessInputSchema,
    input,
    'staging.candidate',
    'unknown',
    'valid same-repository open PR candidate and required check set',
  );
  const candidateSha = parsed.candidateSha;
  if (parsed.pullRequestHeadSha !== candidateSha)
    fail(
      'stale_candidate',
      'staging.candidate',
      candidateSha,
      candidateSha,
      parsed.pullRequestHeadSha,
    );
  const byName = new Map<string, (typeof parsed.checks)[number]>();
  for (const check of parsed.checks) {
    if (check.headSha !== candidateSha)
      fail('check_sha_mismatch', 'staging.candidate', candidateSha, candidateSha, check.headSha);
    if (byName.has(check.name))
      fail(
        'duplicate_check',
        'staging.candidate',
        candidateSha,
        'one result per required workflow',
        check.name,
      );
    byName.set(check.name, check);
  }
  for (const name of RequiredCandidateChecks) {
    const check = byName.get(name);
    if (!check) fail('check_missing', 'staging.candidate', candidateSha, name, 'missing');
    if (check.conclusion !== 'success')
      fail(
        `check_${check.conclusion}`,
        'staging.candidate',
        candidateSha,
        `${name}:success`,
        `${name}:${check.conclusion}`,
      );
  }
  return {
    schemaVersion: 1,
    state: 'CANDIDATE_READY_FOR_STAGING',
    candidateSha,
    prNumber: parsed.prNumber,
    checks: RequiredCandidateChecks.map((name) => ({ name, conclusion: 'success' as const })),
  };
}

export class ReleaseGateError extends Error {
  constructor(
    readonly code: string,
    readonly stage: string,
    readonly candidateSha: string,
    readonly expected: string,
    readonly actual: string,
  ) {
    super(
      `RELEASE_GATE_FAIL stage=${stage} candidate_sha=${candidateSha} code=${code} expected=${expected} actual=${actual}`,
    );
    this.name = 'ReleaseGateError';
  }
}

function fail(
  code: string,
  stage: string,
  candidateSha: string,
  expected: string,
  actual: string,
): never {
  throw new ReleaseGateError(code, stage, candidateSha, expected, actual);
}

function parseEvidence<T>(
  schema: z.ZodType<T>,
  value: unknown,
  stage: string,
  candidateSha: string,
  expected: string,
): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue?.path.map(String).join('.') || 'record';
  fail('invalid_evidence', stage, candidateSha, expected, `${field}:${issue?.code ?? 'invalid'}`);
}

export function createStagingReadyEvidence(input: {
  candidateSha: string;
  pullRequestHeadSha: string;
  candidateTreeSha: string;
  pullRequestTreeSha: string;
  prNumber: number;
  localQa: 'passed' | 'failed';
  ci: 'passed' | 'failed';
  deployment: StagingDeploymentEvidence;
}): StagingReadyEvidence {
  const candidateSha = ShaSchema.parse(input.candidateSha);
  const pullRequestHeadSha = ShaSchema.parse(input.pullRequestHeadSha);
  const candidateTreeSha = ShaSchema.parse(input.candidateTreeSha);
  const pullRequestTreeSha = ShaSchema.parse(input.pullRequestTreeSha);
  if (input.localQa !== 'passed')
    fail('local_qa_not_passed', 'staging.ready', candidateSha, 'passed', input.localQa);
  if (input.ci !== 'passed')
    fail('ci_not_passed', 'staging.ready', candidateSha, 'passed', input.ci);
  if (pullRequestHeadSha !== candidateSha)
    fail('stale_candidate', 'staging.ready', candidateSha, candidateSha, pullRequestHeadSha);
  if (pullRequestTreeSha !== candidateTreeSha)
    fail(
      'candidate_tree_mismatch',
      'staging.ready',
      candidateSha,
      candidateTreeSha,
      pullRequestTreeSha,
    );

  const deployment = parseEvidence(
    StagingDeploymentSchema,
    input.deployment,
    'staging.ready',
    candidateSha,
    'valid staging deployment evidence',
  );
  if (deployment.candidateSha !== candidateSha)
    fail(
      'deployment_sha_mismatch',
      'staging.ready',
      candidateSha,
      candidateSha,
      deployment.candidateSha,
    );

  return ReadyEvidenceSchema.parse({
    schemaVersion: 1,
    state: 'STAGING_READY_FOR_ACCEPTANCE',
    candidateSha,
    candidateTreeSha,
    prNumber: input.prNumber,
    localQa: input.localQa,
    ci: input.ci,
    deployment,
  });
}

export function acceptStagingCandidate(input: {
  ready: StagingReadyEvidence;
  currentPullRequestHeadSha: string;
  currentPullRequestTreeSha: string;
  currentPullRequestNumber: number;
  acceptance: Omit<
    StagingAcceptanceEvidence,
    | 'schemaVersion'
    | 'state'
    | 'candidateSha'
    | 'candidateTreeSha'
    | 'pullRequestNumber'
    | 'deploymentRunId'
    | 'stagingOrigin'
    | 'accepted'
  > & {
    candidateSha: string;
    deploymentRunId: string;
    stagingOrigin: string;
  };
}): StagingAcceptanceEvidence {
  const ready = parseEvidence(
    ReadyEvidenceSchema,
    input.ready,
    'staging.acceptance',
    'unknown',
    'valid staging readiness evidence',
  );
  const currentHead = ShaSchema.parse(input.currentPullRequestHeadSha);
  const currentTree = ShaSchema.parse(input.currentPullRequestTreeSha);
  if (currentHead !== ready.candidateSha)
    fail(
      'pr_head_advanced',
      'staging.acceptance',
      ready.candidateSha,
      ready.candidateSha,
      currentHead,
    );
  if (currentTree !== ready.candidateTreeSha)
    fail(
      'pr_tree_advanced',
      'staging.acceptance',
      ready.candidateSha,
      ready.candidateTreeSha,
      currentTree,
    );
  if (input.currentPullRequestNumber !== ready.prNumber)
    fail(
      'pr_number_mismatch',
      'staging.acceptance',
      ready.candidateSha,
      String(ready.prNumber),
      String(input.currentPullRequestNumber),
    );

  const accepted = parseEvidence(
    AcceptanceEvidenceSchema,
    {
      ...input.acceptance,
      schemaVersion: 1,
      state: 'STAGING_ACCEPTED',
      accepted: true,
      candidateTreeSha: ready.candidateTreeSha,
      pullRequestNumber: ready.prNumber,
    },
    'staging.acceptance',
    ready.candidateSha,
    'valid hosted capability evidence',
  );
  if (accepted.candidateSha !== ready.candidateSha)
    fail(
      'acceptance_sha_mismatch',
      'staging.acceptance',
      ready.candidateSha,
      ready.candidateSha,
      accepted.candidateSha,
    );
  if (accepted.deploymentRunId !== ready.deployment.runId)
    fail(
      'deployment_run_mismatch',
      'staging.acceptance',
      ready.candidateSha,
      ready.deployment.runId,
      accepted.deploymentRunId,
    );
  if (accepted.stagingOrigin !== ready.deployment.origin)
    fail(
      'staging_origin_mismatch',
      'staging.acceptance',
      ready.candidateSha,
      ready.deployment.origin,
      accepted.stagingOrigin,
    );
  return accepted;
}

export function authorizeProductionPromotion(input: {
  requestedSha: string;
  mergeCommitSha: string;
  mergeCommitTreeSha: string;
  repositoryFullName: string;
  associatedPullRequests: Array<{
    number: number;
    state: 'open' | 'closed';
    mergedAt: string | null;
    mergeCommitSha: string | null;
    headSha: string;
    baseBranch: string;
    headRepositoryFullName: string;
  }>;
  acceptance: StagingAcceptanceEvidence;
}): ProductionPromotionEvidence {
  const parsed = parseEvidence(
    ProductionPromotionInputSchema,
    input,
    'production.promotion',
    'unknown',
    'valid accepted candidate and merged pull request provenance',
  );
  const acceptance = parseEvidence(
    AcceptanceEvidenceSchema,
    parsed.acceptance,
    'production.promotion',
    'unknown',
    'valid accepted staging evidence',
  );
  const requestedSha = parsed.requestedSha;
  const mergeCommitSha = parsed.mergeCommitSha;
  const mergeCommitTreeSha = parsed.mergeCommitTreeSha;
  const candidateTreeSha = acceptance.candidateTreeSha;
  const candidateSha = acceptance.candidateSha;
  if (requestedSha !== mergeCommitSha)
    fail(
      'requested_sha_mismatch',
      'production.promotion',
      candidateSha,
      mergeCommitSha,
      requestedSha,
    );
  if (parsed.associatedPullRequests.length === 0)
    fail(
      'merge_pr_missing',
      'production.promotion',
      candidateSha,
      'one associated merged PR',
      'none',
    );
  if (parsed.associatedPullRequests.length !== 1)
    fail(
      'merge_pr_ambiguous',
      'production.promotion',
      candidateSha,
      'one associated merged PR',
      `${parsed.associatedPullRequests.length} PRs`,
    );
  const mergedPr = parsed.associatedPullRequests[0];
  if (mergedPr.state !== 'closed' || mergedPr.mergedAt === null)
    fail(
      'merge_pr_not_merged',
      'production.promotion',
      candidateSha,
      'closed merged PR',
      `${mergedPr.state}:${mergedPr.mergedAt ?? 'not-merged'}`,
    );
  if (mergedPr.number !== acceptance.pullRequestNumber)
    fail(
      'merge_pr_number_mismatch',
      'production.promotion',
      candidateSha,
      String(acceptance.pullRequestNumber),
      String(mergedPr.number),
    );
  if (mergedPr.headSha !== candidateSha)
    fail(
      'merge_pr_head_sha_mismatch',
      'production.promotion',
      candidateSha,
      candidateSha,
      mergedPr.headSha,
    );
  if (mergedPr.mergeCommitSha !== mergeCommitSha)
    fail(
      'merge_commit_sha_mismatch',
      'production.promotion',
      candidateSha,
      mergeCommitSha,
      mergedPr.mergeCommitSha ?? 'missing',
    );
  if (mergedPr.baseBranch !== 'main')
    fail(
      'merge_pr_base_mismatch',
      'production.promotion',
      candidateSha,
      'main',
      mergedPr.baseBranch,
    );
  if (mergedPr.headRepositoryFullName !== parsed.repositoryFullName)
    fail(
      'merge_pr_repository_mismatch',
      'production.promotion',
      candidateSha,
      parsed.repositoryFullName,
      mergedPr.headRepositoryFullName,
    );
  if (mergeCommitTreeSha !== candidateTreeSha)
    fail(
      'merge_tree_sha_mismatch',
      'production.promotion',
      candidateSha,
      candidateTreeSha,
      mergeCommitTreeSha,
    );
  return PromotionEvidenceSchema.parse({
    schemaVersion: 1,
    state: 'PRODUCTION_PROMOTION_READY',
    candidateSha,
    candidateTreeSha,
    pullRequestNumber: mergedPr.number,
    mergeCommitSha,
    mergeCommitTreeSha,
    requestedSha,
    stagingDeploymentRunId: acceptance.deploymentRunId,
  });
}

export function recordProductionSmoke(input: {
  deployedSha: string;
  promotion: ProductionPromotionEvidence;
  probes: Array<{
    name: 'workerVersion' | 'loginShell' | 'authBoundary' | 'safeFunction';
    result: 'passed' | 'failed';
    diagnosticCode?: string;
    observedReleaseSha?: string;
  }>;
}): ProductionSmokeEvidence {
  const promotion = parseEvidence(
    PromotionEvidenceSchema,
    input.promotion,
    'production.smoke',
    'unknown',
    'valid production promotion evidence',
  );
  const deployedSha = ShaSchema.parse(input.deployedSha);
  if (deployedSha !== promotion.mergeCommitSha)
    fail(
      'deployed_sha_mismatch',
      'production.smoke',
      promotion.candidateSha,
      promotion.mergeCommitSha,
      deployedSha,
    );
  const probes = parseEvidence(
    ProductionSmokeSchema.shape.probes,
    input.probes,
    'production.smoke',
    promotion.candidateSha,
    'bounded safe capability probes',
  );
  const requiredProbes = ['workerVersion', 'loginShell', 'authBoundary', 'safeFunction'] as const;
  for (const name of requiredProbes) {
    const count = probes.filter((probe) => probe.name === name).length;
    if (count === 0)
      fail('production_probe_missing', 'production.smoke', promotion.candidateSha, name, 'missing');
    if (count > 1)
      fail(
        'production_probe_duplicate',
        'production.smoke',
        promotion.candidateSha,
        `one ${name} result`,
        `${count} results`,
      );
  }
  const workerVersionProbe = probes.find((probe) => probe.name === 'workerVersion');
  if (
    workerVersionProbe?.result === 'passed' &&
    workerVersionProbe.observedReleaseSha !== deployedSha
  )
    fail(
      'production_release_version_mismatch',
      'production.smoke',
      promotion.candidateSha,
      deployedSha,
      workerVersionProbe.observedReleaseSha ?? 'missing',
    );
  const failures = probes
    .filter((probe) => probe.result === 'failed')
    .map(
      (probe) => `${probe.name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}_failed`,
    );
  return ProductionSmokeSchema.parse({
    schemaVersion: 1,
    state: failures.length ? 'ACTION_REQUIRED' : 'PRODUCTION_ACCEPTED',
    deployedSha,
    probes,
    failures,
  });
}

export interface StagingSlot {
  owner: string;
  candidateSha: string;
}

export function selectLatestRequiredWorkflowRuns(input: unknown) {
  const parsed = LatestRequiredWorkflowRunsInputSchema.parse(input);
  const candidateRuns = parsed.workflowRuns.filter(
    (run) => run.event === 'pull_request' && run.head_sha === parsed.candidateSha,
  );
  return RequiredCandidateChecks.flatMap((name) => {
    const matching = candidateRuns.filter((run) => run.name === name);
    matching.sort(
      (left, right) =>
        left.run_number - right.run_number ||
        left.run_attempt - right.run_attempt ||
        (left.run_started_at ?? '').localeCompare(right.run_started_at ?? '') ||
        left.id - right.id,
    );
    const latest = matching.at(-1);
    return latest ? [latest] : [];
  });
}

export function inspectStagingAcceptanceLease(input: unknown) {
  const parsed = StagingSlotGuardInputSchema.parse(input);
  const owner = parsed.pullRequests
    .filter(
      (pr) =>
        pr.state === 'open' &&
        pr.baseBranch === 'main' &&
        pr.headRepositoryFullName === parsed.repositoryFullName &&
        pr.headSha !== parsed.candidateSha,
    )
    .flatMap((pr) => {
      const latest = pr.statuses
        .filter((status) => status.context === 'AI Operations / Staging capability acceptance')
        .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at))
        .at(-1);
      return latest?.state === 'pending' &&
        latest.description === 'Staging is deployed; waiting for hosted acceptance.'
        ? [{ pullRequestNumber: pr.number, candidateSha: pr.headSha }]
        : [];
    })
    .at(0);
  return owner ? { available: false as const, owner } : { available: true as const };
}

export function acquireStagingSlot(input: {
  owner: string;
  candidateSha: string;
  current?: StagingSlot;
}): StagingSlot {
  const owner = SafeIdSchema.parse(input.owner);
  const candidateSha = ShaSchema.parse(input.candidateSha);
  if (input.current)
    fail(
      'staging_slot_busy',
      'staging.lock',
      candidateSha,
      'available',
      `${input.current.owner}:${input.current.candidateSha}`,
    );
  return { owner, candidateSha };
}

export function releaseStagingSlot(input: {
  slot: StagingSlot;
  owner: string;
  outcome: 'passed' | 'failed' | 'cancelled';
}): null {
  const slot = z
    .object({ owner: SafeIdSchema, candidateSha: ShaSchema })
    .strict()
    .parse(input.slot);
  if (slot.owner !== input.owner)
    fail('staging_slot_owner_mismatch', 'staging.lock', slot.candidateSha, slot.owner, input.owner);
  z.enum(['passed', 'failed', 'cancelled']).parse(input.outcome);
  return null;
}

export function runReleaseGateCommand(command: string, input: unknown): ReleaseGateCommandResult {
  const commandResult = z
    .enum([
      'candidate-readiness',
      'latest-required-workflow-runs',
      'staging-slot-check',
      'staging-status',
      'staging-ready',
      'staging-accept',
      'production-promote',
      'production-smoke',
    ])
    .safeParse(command);
  if (!commandResult.success)
    fail('unknown_command', 'command', 'unknown', 'known release gate command', 'unknown');

  switch (commandResult.data) {
    case 'candidate-readiness':
      return { exitCode: 0, evidence: createCandidateReadinessEvidence(input) };
    case 'latest-required-workflow-runs':
      return {
        exitCode: 0,
        evidence: { workflowRuns: selectLatestRequiredWorkflowRuns(input) },
      };
    case 'staging-slot-check':
      return { exitCode: 0, evidence: inspectStagingAcceptanceLease(input) };
    case 'staging-status':
      return { exitCode: 0, evidence: createStagingAcceptanceStatus(input) };
    case 'staging-ready': {
      const args = parseEvidence(
        StagingReadyInputSchema,
        input,
        'staging.ready',
        'unknown',
        'valid staging readiness input',
      );
      return { exitCode: 0, evidence: createStagingReadyEvidence(args) };
    }
    case 'staging-accept': {
      const args = parseEvidence(
        StagingAcceptanceCommandSchema,
        input,
        'staging.acceptance',
        'unknown',
        'valid staging acceptance input',
      );
      return { exitCode: 0, evidence: acceptStagingCandidate(args) };
    }
    case 'production-promote': {
      const args = parseEvidence(
        ProductionPromotionInputSchema,
        input,
        'production.promotion',
        'unknown',
        'valid production promotion input',
      );
      return { exitCode: 0, evidence: authorizeProductionPromotion(args) };
    }
    case 'production-smoke': {
      const args = parseEvidence(
        ProductionSmokeInputSchema,
        input,
        'production.smoke',
        'unknown',
        'valid production smoke input',
      );
      const evidence = recordProductionSmoke(args);
      return { exitCode: evidence.state === 'PRODUCTION_ACCEPTED' ? 0 : 1, evidence };
    }
  }
}

function runCli(): void {
  const command = process.argv[2] ?? '';
  try {
    const rawInput = readFileSync(0, 'utf8');
    const input: unknown = JSON.parse(rawInput);
    const result = runReleaseGateCommand(command, input);
    process.stdout.write(`${JSON.stringify(result.evidence)}\n`);
    process.exitCode = result.exitCode;
  } catch (error) {
    const safeError =
      error instanceof ReleaseGateError
        ? {
            code: error.code,
            stage: error.stage,
            candidateSha: error.candidateSha,
            expected: error.expected,
            actual: error.actual,
          }
        : {
            code: 'invalid_command_input',
            stage: 'command',
            candidateSha: 'unknown',
            expected: 'valid JSON input',
            actual: 'malformed input',
          };
    process.stderr.write(`${JSON.stringify({ state: 'ACTION_REQUIRED', error: safeError })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/release-gate.ts')) runCli();
