import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import {
  Ai15WorkflowProofsSchema,
  Ai16PromptGovernanceProofSchema,
  createHostedStagingSuiteEvidence,
} from './release-gate.js';

const EvidenceWriteCommonSchema = z
  .object({
    candidateSha: z.string().regex(/^[a-f0-9]{40}$/i),
    candidateTreeSha: z.string().regex(/^[a-f0-9]{40}$/i),
    pullRequestNumber: z.number().int().positive(),
    deploymentRunId: z.string().regex(/^[1-9][0-9]{0,19}$/),
    stagingOrigin: z.literal('https://ai-operations-staging.ai-operations.workers.dev'),
    completeSuite: z.literal('passed'),
    manualMfaChallengeObserved: z.boolean(),
    browserChecks: z
      .object({ chromium: z.literal('passed'), webkit: z.literal('passed') })
      .strict(),
    correlationIds: z
      .array(z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9:-]{0,127}$/))
      .min(1)
      .max(20),
    workflowRuns: Ai15WorkflowProofsSchema.optional(),
    acceptedAt: z.string().datetime({ offset: true }),
  })
  .strict();

const EvidenceChecksSchema = z
  .object({
    authAal2: z.literal('passed'),
    safeRead: z.literal('passed'),
    safeWrite: z.literal('passed'),
    ui: z.literal('passed'),
    edgeFunctions: z.literal('passed'),
    releaseVersion: z.literal('passed'),
  })
  .strict();

const AuthBrowserEvidenceWriteInputSchema = EvidenceWriteCommonSchema.extend({
  acceptanceProfile: z.literal('auth-browser'),
  checks: EvidenceChecksSchema,
  promptGovernanceProof: Ai16PromptGovernanceProofSchema.optional(),
  freshMfaAction: z
    .object({
      staleDenied: z.literal('passed'),
      staleAttemptUsedMfaGate: z.literal(false),
      freshReauthAccepted: z.literal('passed'),
    })
    .strict(),
}).strict();

const TargetedEvidenceWriteInputSchema = EvidenceWriteCommonSchema.extend({
  acceptanceProfile: z.literal('targeted'),
  checks: EvidenceChecksSchema,
  promptGovernanceProof: Ai16PromptGovernanceProofSchema.optional(),
}).strict();

const EvidenceWriteInputSchema = z
  .discriminatedUnion('acceptanceProfile', [
    AuthBrowserEvidenceWriteInputSchema,
    TargetedEvidenceWriteInputSchema,
  ])
  .superRefine((input, context) => {
    if (input.acceptanceProfile === 'auth-browser' && !input.manualMfaChallengeObserved) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'auth-browser acceptance requires an observed manual MFA challenge',
        path: ['manualMfaChallengeObserved'],
      });
    }
    if (input.acceptanceProfile === 'targeted' && input.manualMfaChallengeObserved) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'targeted acceptance must not claim operator MFA was required',
        path: ['manualMfaChallengeObserved'],
      });
    }
  });

export async function writeLiveStagingAcceptanceEvidence(
  path: string,
  rawInput: unknown,
): Promise<void> {
  const input = EvidenceWriteInputSchema.parse(rawInput);
  const commonEvidence = {
    schemaVersion: 1,
    candidateSha: input.candidateSha,
    candidateTreeSha: input.candidateTreeSha,
    pullRequestNumber: input.pullRequestNumber,
    deploymentRunId: input.deploymentRunId,
    stagingOrigin: input.stagingOrigin,
    humanMfa: input.manualMfaChallengeObserved ? 'user-completed' : 'not-required',
    correlationIds: input.correlationIds,
    workflowRuns: input.workflowRuns,
    acceptedAt: input.acceptedAt,
  } as const;
  const evidence =
    input.acceptanceProfile === 'auth-browser'
      ? createHostedStagingSuiteEvidence({
          ...commonEvidence,
          state: 'LIVE_STAGING_E2E_ACCEPTED',
          acceptanceProfile: 'auth-browser',
          checks: input.checks,
          freshMfaAction: input.freshMfaAction,
          promptGovernanceProof: input.promptGovernanceProof,
        })
      : createHostedStagingSuiteEvidence({
          ...commonEvidence,
          state: 'TARGETED_STAGING_ACCEPTED',
          acceptanceProfile: 'targeted',
          checks: [
            { name: 'complete-suite', result: input.completeSuite },
            { name: 'auth-aal2', result: input.checks.authAal2 },
            { name: 'safe-read', result: input.checks.safeRead },
            { name: 'safe-write', result: input.checks.safeWrite },
            { name: 'ui', result: input.checks.ui },
            { name: 'edge-functions', result: input.checks.edgeFunctions },
            { name: 'release-version', result: input.checks.releaseVersion },
            { name: 'chromium', result: input.browserChecks.chromium },
            { name: 'webkit', result: input.browserChecks.webkit },
          ],
          promptGovernanceProof: input.promptGovernanceProof,
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
