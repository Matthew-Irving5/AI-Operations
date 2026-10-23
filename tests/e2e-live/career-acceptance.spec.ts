import { createHash, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { z } from 'zod';
import { parseLiveE2eEnvironment, stagingTarget } from '../../apps/web/lib/live-e2e-safety';
import {
  CareerOwnerDenialAuditColumns,
  CareerOwnerDenialAuditRowSchema,
} from '../../infrastructure/scripts/career-owner-denial-audit.js';
import { writeCareerStagingAcceptanceEvidence } from '../../infrastructure/scripts/career-staging-acceptance-evidence.js';

const env = parseLiveE2eEnvironment(process.env, 'auth-acceptance');
const userId = z.string().uuid().parse(process.env.LIVE_E2E_USER_ID);
const candidateSha = z
  .string()
  .regex(/^[a-f0-9]{40}$/i)
  .parse(process.env.LIVE_E2E_CANDIDATE_SHA);
const candidateTreeSha = z
  .string()
  .regex(/^[a-f0-9]{40}$/i)
  .parse(process.env.LIVE_E2E_CANDIDATE_TREE_SHA);
const pullRequestNumber = z.coerce
  .number()
  .int()
  .positive()
  .parse(process.env.LIVE_E2E_PULL_REQUEST_NUMBER);
const deploymentRunId = z
  .string()
  .regex(/^[1-9][0-9]{0,19}$/)
  .parse(process.env.LIVE_E2E_DEPLOYMENT_RUN_ID);
const outputPath = process.env.LIVE_E2E_ACCEPTANCE_OUTPUT_PATH;

const SyncResultSchema = z
  .object({
    code: z.literal('github_sync_complete'),
    requestId: z.string().uuid(),
    owner: z.literal('Matthew-Irving5'),
    repositories: z.number().int().positive(),
    evidenceRecords: z.number().int().positive(),
    retrievedAt: z.string().datetime({ offset: true }),
  })
  .passthrough();

const OwnerDenialResponseSchema = z
  .object({
    code: z.string(),
    requestId: z.string().uuid(),
  })
  .passthrough();

type DenialEvidence = {
  ownerClass: 'brightsg' | 'other';
  httpStatus: 403;
  code: 'github_owner_hard_denied' | 'github_owner_not_allowlisted';
  requestId: string;
  auditAction: 'github_career_sync_owner_denied';
  auditTargetType: 'github_owner';
  auditTargetId: 'hard_denied' | 'not_allowlisted';
  auditResult: 'denied';
  providerRequestMade: false;
};

type SkillLinks = {
  href: string;
  context: string;
};

function failUnless(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function datedLabelDate(text: string, label: 'merged' | 'Retrieved'): string | null {
  const match = new RegExp(`${label}\\s+(\\d{1,2})/(\\d{1,2})/(\\d{4})`, 'i').exec(text);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function githubPath(
  urlValue: string,
): { owner: string; repository: string; parts: string[] } | null {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.search || url.hash)
    return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 4 || parts[0]?.toLowerCase() !== 'matthew-irving5') return null;
  const owner = parts[0]!;
  const repository = parts[1]!;
  return { owner, repository, parts };
}

function assertDatedMergedPullRequest(link: SkillLinks): {
  repositoryKey: string;
  mergedDate: string;
} | null {
  const address = githubPath(link.href);
  if (!address || address.parts[2] !== 'pull' || !/^\d+$/.test(address.parts[3] ?? '')) {
    return null;
  }
  const mergedDate = datedLabelDate(link.context, 'merged');
  if (!mergedDate) return null;
  return {
    repositoryKey: `${address.owner.toLowerCase()}/${address.repository.toLowerCase()}`,
    mergedDate,
  };
}

function assertAddedSourceBlob(link: SkillLinks): {
  repositoryKey: string;
  extension: string;
  addedLines: number;
} | null {
  const address = githubPath(link.href);
  if (!address || address.parts[2] !== 'blob' || address.parts.length < 5) return null;
  const extension = address.parts.at(-1)?.split('.').at(-1)?.toLowerCase();
  if (!extension || !/\((\d+) added lines?\)/i.test(link.context)) return null;
  const addedLines = Number(/\((\d+) added lines?\)/i.exec(link.context)?.[1]);
  if (addedLines <= 0) return null;
  return {
    repositoryKey: `${address.owner.toLowerCase()}/${address.repository.toLowerCase()}`,
    extension,
    addedLines,
  };
}

async function auditRows(query: URLSearchParams): Promise<unknown[]> {
  const response = await fetch(`${env.LIVE_E2E_SUPABASE_URL}/rest/v1/audit_events?${query}`, {
    headers: {
      apikey: env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!response.ok)
    throw new Error(`Staging owner-denial audit read failed with HTTP ${response.status}.`);
  const value: unknown = await response.json();
  if (!Array.isArray(value)) throw new Error('Staging owner-denial audit response was invalid.');
  return value;
}

async function verifyOwnerDenial(
  page: import('@playwright/test').Page,
  input: {
    owner: string;
    ownerClass: 'brightsg' | 'other';
    expectedCode: 'github_owner_hard_denied' | 'github_owner_not_allowlisted';
    auditTargetId: 'hard_denied' | 'not_allowlisted';
  },
): Promise<DenialEvidence> {
  const requestId = randomUUID();
  const response = await page.evaluate(
    async ({ owner, requestId }) => {
      const result = await fetch('/api/career/github-sync', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-client-request-id': requestId,
        },
        body: JSON.stringify({ owner }),
      });
      return { status: result.status, body: (await result.json()) as unknown };
    },
    { owner: input.owner, requestId },
  );
  const parsed = OwnerDenialResponseSchema.safeParse(response.body);
  failUnless(
    response.status === 403 && parsed.success && parsed.data.code === input.expectedCode,
    'Career owner denial did not return the expected 403 policy code.',
  );
  failUnless(
    parsed.data.requestId === requestId,
    'Career owner denial request ID did not match its probe.',
  );

  const query = new URLSearchParams({
    select: CareerOwnerDenialAuditColumns.join(','),
    user_id: `eq.${userId}`,
    correlation_id: `eq.${requestId}`,
    action_type: 'eq.github_career_sync_owner_denied',
    target_type: 'eq.github_owner',
    target_id: `eq.${input.auditTargetId}`,
    result: 'eq.denied',
    limit: '2',
  });
  const rows = (await auditRows(query)).map((row) => CareerOwnerDenialAuditRowSchema.parse(row));
  failUnless(
    rows.length === 1,
    'Career owner denial did not produce exactly one audit event for this request ID.',
  );
  const audit = rows[0]!;
  failUnless(
    audit.correlation_id === requestId &&
      audit.target_id === input.auditTargetId &&
      audit.redacted_after.provider_request_made === false,
    'Career owner-denial audit did not prove that no provider request was made.',
  );
  return {
    ownerClass: input.ownerClass,
    httpStatus: 403,
    code: input.expectedCode,
    requestId,
    auditAction: audit.action_type,
    auditTargetType: audit.target_type,
    auditTargetId: audit.target_id,
    auditResult: audit.result,
    providerRequestMade: false,
  };
}

test('staging proves personal Career sync provenance and separate non-owner denials', async ({
  page,
}) => {
  test.setTimeout(15 * 60_000);
  failUnless(outputPath, 'Career acceptance evidence output path is missing.');
  failUnless(
    env.LIVE_E2E_BASE_URL === stagingTarget.origin,
    'Career acceptance origin is not fixed staging.',
  );

  let initialMfaChallengeObserved = false;
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    try {
      if (new URL(frame.url()).pathname === '/mfa') initialMfaChallengeObserved = true;
    } catch {
      // Only the staging MFA route can satisfy the sign-in proof.
    }
  });

  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'AI Operations' })).toBeVisible();
  if (env.LIVE_E2E_EMAIL && env.LIVE_E2E_PASSWORD) {
    await page.getByLabel('Email').fill(env.LIVE_E2E_EMAIL);
    await page.getByLabel('Password').fill(env.LIVE_E2E_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/mfa(?:\?|$)/, { timeout: 20_000 });
  }
  process.stdout.write(
    '\nAI-35 staging browser is open at login. Sign in and complete Microsoft Authenticator when the challenge appears; the browser journey resumes automatically.\n',
  );
  await expect(page).toHaveURL(/\/overview(?:\?|$)/, { timeout: 5 * 60_000 });
  failUnless(initialMfaChallengeObserved, 'The real staging sign-in MFA route was not observed.');

  await page.goto('/career');
  await expect(page.getByRole('heading', { name: 'Career Operations' })).toBeVisible();
  const syncExchange: { status: number | null; payload: unknown } = {
    status: null,
    payload: null,
  };
  await page.route(
    (url) => url.origin === stagingTarget.origin && url.pathname === '/api/career/github-sync',
    async (route) => {
      const upstreamResponse = await route.fetch();
      const responseBody = await upstreamResponse.body();
      syncExchange.status = upstreamResponse.status();
      try {
        syncExchange.payload = JSON.parse(responseBody.toString('utf8')) as unknown;
      } catch {
        syncExchange.payload = null;
      }
      await route.fulfill({ response: upstreamResponse });
    },
  );
  await page
    .getByRole('button', { name: 'Connect and sync personal GitHub (fresh MFA required)' })
    .click();
  await expect(page.getByRole('article', { name: 'GitHub fresh MFA' })).toBeVisible();
  await expect(page.getByLabel('Six-digit code')).toBeVisible();
  process.stdout.write(
    '\nAI-35 fresh sync challenge is visible in the headed Career browser. Complete Microsoft Authenticator in that browser; the sync will submit automatically. Do not send the code here.\n',
  );
  const syncResponseStatus = syncExchange.status;
  const sync = SyncResultSchema.safeParse(syncExchange.payload);
  failUnless(
    syncResponseStatus === 200 && sync.success,
    'Career personal GitHub sync did not complete successfully.',
  );
  await expect(page.getByRole('heading', { name: 'Career evidence snapshot' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText('Demonstrated skills', { exact: true })).toBeVisible();

  const skillCards = page
    .locator('article.card')
    .filter({ hasText: 'Evidence type: authored source change' });
  const skillCount = await skillCards.count();
  failUnless(
    skillCount > 0,
    'Career snapshot contains no demonstrated skill with an authored source change.',
  );
  const skillCitations: SkillLinks[][][] = await skillCards.evaluateAll((cards) =>
    cards.map((card) =>
      Array.from(card.querySelectorAll(':scope > ul > li')).map((citation) =>
        Array.from(citation.querySelectorAll('a')).map((anchor) => ({
          href: (anchor as HTMLAnchorElement).href,
          context: anchor.closest('li')?.innerText ?? anchor.parentElement?.innerText ?? '',
        })),
      ),
    ),
  );

  let citationProof:
    | {
        mergedDate: string;
        retrievedDate: string;
        mergedPullRequestUrlSha256: string;
        sourceFileBlobUrlSha256: string;
        sourceFileExtension: string;
        addedLines: number;
      }
    | undefined;
  for (const citations of skillCitations) {
    for (const links of citations) {
      const pullRequests = links
        .map((link) => ({ link, parsed: assertDatedMergedPullRequest(link) }))
        .filter(
          (
            entry,
          ): entry is {
            link: SkillLinks;
            parsed: NonNullable<ReturnType<typeof assertDatedMergedPullRequest>>;
          } => entry.parsed !== null,
        );
      const sourceFiles = links
        .map((link) => ({ link, parsed: assertAddedSourceBlob(link) }))
        .filter(
          (
            entry,
          ): entry is {
            link: SkillLinks;
            parsed: NonNullable<ReturnType<typeof assertAddedSourceBlob>>;
          } => entry.parsed !== null,
        );
      for (const pullRequest of pullRequests) {
        for (const sourceFile of sourceFiles) {
          if (pullRequest.parsed.repositoryKey !== sourceFile.parsed.repositoryKey) continue;
          const retrievedDate = datedLabelDate(pullRequest.link.context, 'Retrieved');
          if (!retrievedDate) continue;
          citationProof = {
            mergedDate: pullRequest.parsed.mergedDate,
            retrievedDate,
            mergedPullRequestUrlSha256: sha256(pullRequest.link.href),
            sourceFileBlobUrlSha256: sha256(sourceFile.link.href),
            sourceFileExtension: sourceFile.parsed.extension,
            addedLines: sourceFile.parsed.addedLines,
          };
          break;
        }
        if (citationProof) break;
      }
      if (citationProof) break;
    }
    if (citationProof) break;
  }
  failUnless(
    citationProof,
    'Career skills lack a dated merged PR linked to an added authored source-file blob.',
  );

  const denialProofs: DenialEvidence[] = [];
  denialProofs.push(
    await verifyOwnerDenial(page, {
      owner: 'BrightSG',
      ownerClass: 'brightsg',
      expectedCode: 'github_owner_hard_denied',
      auditTargetId: 'hard_denied',
    }),
  );
  denialProofs.push(
    await verifyOwnerDenial(page, {
      owner: 'UnlistedOwner',
      ownerClass: 'other',
      expectedCode: 'github_owner_not_allowlisted',
      auditTargetId: 'not_allowlisted',
    }),
  );

  await writeCareerStagingAcceptanceEvidence(outputPath, {
    schemaVersion: 1,
    state: 'CAREER_STAGING_ACCEPTED',
    acceptanceProfile: 'career',
    candidateSha: candidateSha.toLowerCase(),
    candidateTreeSha: candidateTreeSha.toLowerCase(),
    pullRequestNumber,
    deploymentRunId,
    stagingOrigin: stagingTarget.origin,
    humanMfa: 'user-completed',
    correlationIds: [sync.data.requestId, denialProofs[0]!.requestId, denialProofs[1]!.requestId],
    checks: {
      authenticatedCareerSync: 'passed',
      personalGithubScope: 'passed',
      demonstratedSkillCitation: 'passed',
      brightSgDenied: 'passed',
      otherOwnerDenied: 'passed',
      ownerDenialAuditNoProviderRequest: 'passed',
      chromium: 'passed',
    },
    proof: {
      githubOwner: sync.data.owner,
      sync: {
        httpStatus: syncResponseStatus,
        repositories: sync.data.repositories,
        evidenceRecords: sync.data.evidenceRecords,
        requestId: sync.data.requestId,
        retrievedAt: sync.data.retrievedAt,
      },
      skillCitation: {
        skillCount,
        evidenceStrength: 'authored-source-change',
        mergedDate: citationProof.mergedDate,
        retrievedDate: citationProof.retrievedDate,
        mergedPullRequestUrlSha256: citationProof.mergedPullRequestUrlSha256,
        sourceFileBlobUrlSha256: citationProof.sourceFileBlobUrlSha256,
        sourceFileExtension: citationProof.sourceFileExtension,
        addedLines: citationProof.addedLines,
      },
      ownerDenials: denialProofs,
    },
    acceptedAt: new Date().toISOString(),
  });
});
