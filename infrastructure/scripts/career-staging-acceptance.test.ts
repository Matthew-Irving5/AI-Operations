import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  CareerOwnerDenialAuditColumns,
  CareerOwnerDenialAuditRowSchema,
} from './career-owner-denial-audit.js';
import { waitForCapturedCareerSyncResponse } from './career-sync-response.js';
import { CareerStagingAcceptanceEvidenceSchema } from './career-staging-acceptance-evidence.js';

const syncRequestId = 'f46c233d-9971-422f-82a5-7262029570ab';
const brightSgRequestId = '2b2bd312-6a89-4df4-87c3-25c575eb8f53';
const otherOwnerRequestId = 'b4f31941-3cf3-4886-b8f0-a8a23662974c';

test('Career denial REST projection contains and parses every strict audit field', () => {
  const projectedRow = {
    correlation_id: brightSgRequestId,
    action_type: 'github_career_sync_owner_denied',
    target_type: 'github_owner',
    target_id: 'hard_denied',
    result: 'denied',
    redacted_after: { provider_request_made: false },
    created_at: '2026-10-23T09:30:00.000Z',
  };
  const row = CareerOwnerDenialAuditRowSchema.parse(
    Object.fromEntries(
      CareerOwnerDenialAuditColumns.map((column) => [column, projectedRow[column]]),
    ),
  );

  assert.deepEqual(
    [...CareerOwnerDenialAuditColumns].sort(),
    Object.keys(CareerOwnerDenialAuditRowSchema.shape).sort(),
  );
  assert.equal(row.created_at, projectedRow.created_at);
});

test('Career acceptance locator uses the accessible role rendered by the MFA action', async () => {
  const [acceptanceSpec, syncControl] = await Promise.all([
    readFile(new URL('../../tests/e2e-live/career-acceptance.spec.ts', import.meta.url), 'utf8'),
    readFile(
      new URL('../../apps/web/app/(app)/career/github-sync-control.tsx', import.meta.url),
      'utf8',
    ),
  ]);

  assert.match(syncControl, /<article className="stack" aria-label="GitHub fresh MFA">/);
  assert.match(acceptanceSpec, /getByRole\('article', \{ name: 'GitHub fresh MFA' \}\)/);
});

test('Career acceptance captures the real sync response before page reload', async () => {
  const acceptanceSpec = await readFile(
    new URL('../../tests/e2e-live/career-acceptance.spec.ts', import.meta.url),
    'utf8',
  );
  const captureStart = acceptanceSpec.indexOf('const syncExchange = new Promise');
  const upstreamFetch = acceptanceSpec.indexOf('await route.fetch()', captureStart);
  const bodyRead = acceptanceSpec.indexOf('await upstreamResponse.body()', upstreamFetch);
  const responseFulfill = acceptanceSpec.indexOf(
    'await route.fulfill({ response: upstreamResponse })',
    bodyRead,
  );

  assert.ok(captureStart >= 0);
  assert.ok(upstreamFetch > captureStart);
  assert.ok(bodyRead > upstreamFetch);
  assert.ok(responseFulfill > bodyRead);
  assert.doesNotMatch(acceptanceSpec, /page\.waitForResponse\(/);
});

test('Career acceptance waits for a delayed real sync response after the MFA prompt', async () => {
  let captureResponse!: (response: { status: number; payload: unknown }) => void;
  const delayedResponse = new Promise<{ status: number; payload: unknown }>((resolve) => {
    captureResponse = resolve;
  });
  const expectedResponse = { status: 200, payload: { code: 'github_sync_complete' } };
  const acceptanceSpec = await readFile(
    new URL('../../tests/e2e-live/career-acceptance.spec.ts', import.meta.url),
    'utf8',
  );
  const prompt = acceptanceSpec.indexOf('AI-35 fresh sync challenge is visible');
  const wait = acceptanceSpec.indexOf('waitForCapturedCareerSyncResponse(syncExchange', prompt);
  const responseRead = acceptanceSpec.indexOf(
    'const syncResponseStatus = capturedSync.status;',
    prompt,
  );

  assert.ok(prompt >= 0);
  assert.ok(wait > prompt);
  assert.ok(responseRead > wait);

  let waitSettled = false;
  const waitingForResponse = waitForCapturedCareerSyncResponse(delayedResponse, 1_000).then(
    (response) => {
      waitSettled = true;
      return response;
    },
  );
  assert.equal(waitSettled, false);
  captureResponse(expectedResponse);
  assert.deepEqual(await waitingForResponse, expectedResponse);
  assert.equal(waitSettled, true);
});

test('Career acceptance bounds the wait for a missing sync response', async () => {
  await assert.rejects(
    waitForCapturedCareerSyncResponse(new Promise<never>(() => undefined), 1),
    /Timed out waiting for the actual Career sync response/,
  );
});

test('Career acceptance waits for the real sync response after the fresh MFA prompt', async () => {
  const acceptanceSpec = await readFile(
    new URL('../../tests/e2e-live/career-acceptance.spec.ts', import.meta.url),
    'utf8',
  );
  const prompt = acceptanceSpec.indexOf('AI-35 fresh sync challenge is visible');
  const wait = acceptanceSpec.indexOf('waitForCapturedCareerSyncResponse(syncExchange', prompt);
  const responseRead = acceptanceSpec.indexOf(
    'const syncResponseStatus = capturedSync.status;',
    prompt,
  );

  assert.ok(prompt >= 0);
  assert.ok(wait > prompt);
  assert.ok(responseRead > wait);
});

function validEvidence() {
  return {
    schemaVersion: 1,
    state: 'CAREER_STAGING_ACCEPTED',
    acceptanceProfile: 'career',
    candidateSha: 'a'.repeat(40),
    candidateTreeSha: 'b'.repeat(40),
    pullRequestNumber: 182,
    deploymentRunId: '39790001234',
    stagingOrigin: 'https://ai-operations-staging.ai-operations.workers.dev',
    humanMfa: 'user-completed',
    correlationIds: [syncRequestId, brightSgRequestId, otherOwnerRequestId],
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
      githubOwner: 'Matthew-Irving5',
      sync: {
        httpStatus: 200,
        repositories: 50,
        evidenceRecords: 42,
        requestId: syncRequestId,
        retrievedAt: '2026-10-22T09:30:00.000Z',
      },
      skillCitation: {
        skillCount: 4,
        evidenceStrength: 'authored-source-change',
        mergedDate: '2026-10-18',
        retrievedDate: '2026-10-22',
        mergedPullRequestUrlSha256: 'c'.repeat(64),
        sourceFileBlobUrlSha256: 'd'.repeat(64),
        sourceFileExtension: 'ts',
        addedLines: 18,
      },
      ownerDenials: [
        {
          ownerClass: 'brightsg',
          httpStatus: 403,
          code: 'github_owner_hard_denied',
          requestId: brightSgRequestId,
          auditAction: 'github_career_sync_owner_denied',
          auditTargetType: 'github_owner',
          auditTargetId: 'hard_denied',
          auditResult: 'denied',
          providerRequestMade: false,
        },
        {
          ownerClass: 'other',
          httpStatus: 403,
          code: 'github_owner_not_allowlisted',
          requestId: otherOwnerRequestId,
          auditAction: 'github_career_sync_owner_denied',
          auditTargetType: 'github_owner',
          auditTargetId: 'not_allowlisted',
          auditResult: 'denied',
          providerRequestMade: false,
        },
      ],
    },
    acceptedAt: '2026-10-22T09:30:00.000Z',
  };
}

test('Career staging acceptance schema accepts candidate-bound redacted proof', () => {
  const evidence = CareerStagingAcceptanceEvidenceSchema.parse(validEvidence());
  assert.equal(evidence.pullRequestNumber, 182);
  assert.deepEqual(evidence.correlationIds, [
    syncRequestId,
    brightSgRequestId,
    otherOwnerRequestId,
  ]);
});

test('Career staging acceptance schema rejects a provider request in a denial audit', () => {
  const evidence = validEvidence();
  const input = {
    ...evidence,
    proof: {
      ...evidence.proof,
      ownerDenials: [
        { ...evidence.proof.ownerDenials[0]!, providerRequestMade: true },
        evidence.proof.ownerDenials[1]!,
      ],
    },
  };
  assert.equal(CareerStagingAcceptanceEvidenceSchema.safeParse(input).success, false);
});

test('Career staging acceptance schema rejects denial rows in the wrong order', () => {
  const evidence = validEvidence();
  const input = {
    ...evidence,
    proof: {
      ...evidence.proof,
      ownerDenials: [evidence.proof.ownerDenials[1]!, evidence.proof.ownerDenials[0]!],
    },
  };
  assert.equal(CareerStagingAcceptanceEvidenceSchema.safeParse(input).success, false);
});

test('Career staging acceptance schema binds correlation IDs to the tested requests', () => {
  const evidence = validEvidence();
  const input = {
    ...evidence,
    correlationIds: [syncRequestId, '2954cc7a-594f-46d4-aa05-2ab7cbc07d30', otherOwnerRequestId],
  };
  assert.equal(CareerStagingAcceptanceEvidenceSchema.safeParse(input).success, false);
});

test('Career staging acceptance schema rejects private paths and unapproved source types', () => {
  const evidence = validEvidence();
  const withPath = {
    ...evidence,
    proof: {
      ...evidence.proof,
      skillCitation: { ...evidence.proof.skillCitation, sourceFilePath: 'private/repo/path.ts' },
    },
  };
  assert.equal(CareerStagingAcceptanceEvidenceSchema.safeParse(withPath).success, false);

  const withDocumentation = {
    ...evidence,
    proof: {
      ...evidence.proof,
      skillCitation: { ...evidence.proof.skillCitation, sourceFileExtension: 'md' },
    },
  };
  assert.equal(CareerStagingAcceptanceEvidenceSchema.safeParse(withDocumentation).success, false);
});

test('Career staging acceptance schema rejects impossible citation dates', () => {
  const evidence = validEvidence();
  const input = {
    ...evidence,
    proof: {
      ...evidence.proof,
      skillCitation: { ...evidence.proof.skillCitation, mergedDate: '2026-02-31' },
    },
  };
  assert.equal(CareerStagingAcceptanceEvidenceSchema.safeParse(input).success, false);
});
