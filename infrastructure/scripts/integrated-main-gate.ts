import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

// Evidence is produced only by the successful explicitly dispatched exact-main staging workflow.
// The release workflow obtains GitHub run, commit, ref and artifact objects via GitHub API.
const Sha = z.string().regex(/^[a-f0-9]{40}$/);
const RunId = z.string().regex(/^[1-9][0-9]{0,19}$/);
const Repo = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
const Passed = z.literal('passed');

export const IntegratedMainStagingEvidenceSchema = z
  .object({
    schemaVersion: z.literal(2),
    state: z.literal('INTEGRATED_MAIN_STAGING_VERIFIED'),
    repositoryFullName: Repo,
    mainSha: Sha,
    mainTreeSha: Sha,
    stagingRunId: RunId,
    stagingRunAttempt: z.number().int().positive(),
    stagingOrigin: z.literal('https://ai-operations-staging.ai-operations.workers.dev'),
    checks: z
      .object({
        migrations: Passed,
        edgeFunctions: Passed,
        sourceDrift: Passed,
        readinessSmoke: Passed,
      })
      .strict(),
  })
  .strict();

const Run = z
  .object({
    repositoryFullName: Repo,
    name: z.literal('Deploy staging'),
    path: z.literal('.github/workflows/deploy-staging.yml'),
    headBranch: z.literal('main'),
    headSha: Sha,
    event: z.literal('workflow_dispatch'),
    status: z.literal('completed'),
    conclusion: z.literal('success'),
    runId: RunId,
    runAttempt: z.number().int().positive(),
  })
  .strict();

export const IntegratedMainPromotionInputSchema = z
  .object({
    repositoryFullName: Repo,
    requestedSha: Sha,
    currentMainSha: Sha,
    mainTreeSha: Sha,
    stagingRun: Run,
    evidence: IntegratedMainStagingEvidenceSchema,
  })
  .strict();

export const IntegratedMainPromotionEvidenceSchema = z
  .object({
    schemaVersion: z.literal(2),
    state: z.literal('PRODUCTION_PROMOTION_READY'),
    releaseMode: z.literal('integrated_main'),
    repositoryFullName: Repo,
    mainSha: Sha,
    mainTreeSha: Sha,
    requestedSha: Sha,
    stagingDeploymentRunId: RunId,
    stagingRunAttempt: z.number().int().positive(),
  })
  .strict();

export function authorizeIntegratedMainPromotion(input: unknown) {
  const value = IntegratedMainPromotionInputSchema.parse(input);
  const { evidence, stagingRun } = value;
  if (
    value.requestedSha !== value.currentMainSha
  ) {
    throw new Error('stale_integrated_main_sha');
  }
  if (
    value.repositoryFullName !== evidence.repositoryFullName ||
    value.repositoryFullName !== stagingRun.repositoryFullName
  ) {
    throw new Error('integrated_main_repository_mismatch');
  }
  if (
    value.currentMainSha !== evidence.mainSha ||
    value.currentMainSha !== stagingRun.headSha ||
    value.mainTreeSha !== evidence.mainTreeSha
  ) {
    throw new Error('integrated_main_commit_or_tree_mismatch');
  }
  if (
    stagingRun.runId !== evidence.stagingRunId ||
    stagingRun.runAttempt !== evidence.stagingRunAttempt
  ) {
    throw new Error('integrated_main_staging_run_mismatch');
  }
  return IntegratedMainPromotionEvidenceSchema.parse({
    schemaVersion: 2,
    state: 'PRODUCTION_PROMOTION_READY',
    releaseMode: 'integrated_main',
    repositoryFullName: value.repositoryFullName,
    mainSha: value.currentMainSha,
    mainTreeSha: value.mainTreeSha,
    requestedSha: value.requestedSha,
    stagingDeploymentRunId: stagingRun.runId,
    stagingRunAttempt: stagingRun.runAttempt,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const input: unknown = JSON.parse(readFileSync(0, 'utf8'));
    process.stdout.write(JSON.stringify(authorizeIntegratedMainPromotion(input)) + '\n');
  } catch (error) {
    process.stderr.write(error instanceof Error ? error.message + '\n' : 'invalid_release_evidence\n');
    process.exitCode = 1;
  }
}
