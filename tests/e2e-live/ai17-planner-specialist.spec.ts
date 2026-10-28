import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { parseLiveE2eEnvironment, stagingTarget } from '../../apps/web/lib/live-e2e-safety';
import { resolveGitTreeSha } from '../../infrastructure/scripts/live-acceptance-evidence.js';

const env = parseLiveE2eEnvironment(process.env, 'planner-specialist');
const candidateSha = process.env.LIVE_E2E_CANDIDATE_SHA?.toLowerCase();
const candidateTreeSha = process.env.LIVE_E2E_CANDIDATE_TREE_SHA?.toLowerCase();
const pullRequestNumber = Number(process.env.LIVE_E2E_PULL_REQUEST_NUMBER);
const deploymentRunId = process.env.LIVE_E2E_DEPLOYMENT_RUN_ID;

type WorkflowRun = {
  id: string;
  status: string;
  correlation_id: string;
  idempotency_key: string;
};

type SpecialistRequest = {
  id: string;
  status: string;
  destination_run_id: string;
  result_reference: string | null;
  correlation_id: string;
};

type SpecialistReply = {
  id: string;
  request_id: string;
  kind: string;
  result_reference: string | null;
  correlation_id: string;
};

type PersistedReport = { id: string; run_id: string };

async function serviceRows<T>(
  table: string,
  filters: Readonly<Record<string, string>>,
  select = '*',
): Promise<T[]> {
  const query = new URLSearchParams({ select, ...filters });
  const response = await fetch(`${env.LIVE_E2E_SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!response.ok)
    throw new Error(`Staging read of ${table} failed with HTTP ${response.status}.`);
  return (await response.json()) as T[];
}

async function waitForJourney(runId: string): Promise<{
  sourceRun: WorkflowRun;
  specialistRequest: SpecialistRequest;
  specialistRun: WorkflowRun;
  specialistReply: SpecialistReply;
  specialistReport: PersistedReport;
  consolidatedReport: PersistedReport;
}> {
  const deadline = Date.now() + 12 * 60_000;
  while (Date.now() < deadline) {
    const [sourceRuns, requests, consolidatedReports] = await Promise.all([
      serviceRows<WorkflowRun>(
        'workflow_runs',
        { id: `eq.${runId}` },
        'id,status,correlation_id,idempotency_key',
      ),
      serviceRows<SpecialistRequest>('inter_agent_requests', {
        source_run_id: `eq.${runId}`,
        destination_manager_code: 'eq.travel',
      }, 'id,status,destination_run_id,result_reference,correlation_id'),
      serviceRows<PersistedReport>(
        'reports',
        { run_id: `eq.${runId}` },
        'id,run_id',
      ),
    ]);
    const sourceRun = sourceRuns[0];
    const specialistRequest = requests[0];
    if (!sourceRun) throw new Error('The Planner workflow run was not persisted.');
    if (['failed', 'cancelled'].includes(sourceRun.status)) {
      throw new Error(`Planner workflow ended with status ${sourceRun.status}.`);
    }
    if (specialistRequest && ['failed', 'rejected'].includes(specialistRequest.status)) {
      throw new Error(`Travel specialist request ended with status ${specialistRequest.status}.`);
    }
    if (specialistRequest?.status === 'completed' && sourceRun.status === 'succeeded') {
      const [specialistRuns, replies, specialistReports] = await Promise.all([
        serviceRows<WorkflowRun>('workflow_runs', {
          id: `eq.${specialistRequest.destination_run_id}`,
        }, 'id,status,correlation_id,idempotency_key'),
        serviceRows<SpecialistReply>('inter_agent_replies', {
          request_id: `eq.${specialistRequest.id}`,
        }, 'id,request_id,kind,result_reference,correlation_id'),
        serviceRows<PersistedReport>('reports', {
          run_id: `eq.${specialistRequest.destination_run_id}`,
        }, 'id,run_id'),
      ]);
      const specialistRun = specialistRuns[0];
      const specialistReply = replies[0];
      const specialistReport = specialistReports[0];
      const consolidatedReport = consolidatedReports[0];
      if (
        specialistRun?.status === 'succeeded' &&
        specialistReply?.kind === 'completed' &&
        specialistReport &&
        consolidatedReport
      ) {
        return {
          sourceRun,
          specialistRequest,
          specialistRun,
          specialistReply,
          specialistReport,
          consolidatedReport,
        };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error('The persisted Planner-to-Travel journey did not complete within 12 minutes.');
}

test('AI-17 completes one candidate-bound Planner-to-Travel journey @ai17-planner-specialist-acceptance', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(15 * 60_000);
  expect(candidateSha).toMatch(/^[a-f0-9]{40}$/);
  expect(candidateTreeSha).toMatch(/^[a-f0-9]{40}$/);
  expect(pullRequestNumber).toBeGreaterThan(0);
  expect(deploymentRunId).toMatch(/^[1-9][0-9]{0,19}$/);
  expect(resolveGitTreeSha(candidateSha!)).toBe(candidateTreeSha);

  const release = await page.request.get(new URL('/api/release', stagingTarget.origin).href);
  expect(release.status()).toBe(200);
  expect(await release.json()).toEqual({
    schemaVersion: 1,
    releaseSha: candidateSha,
  });

  let manualMfaChallengeObserved = false;
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    try {
      if (new URL(frame.url()).pathname === '/mfa') manualMfaChallengeObserved = true;
    } catch {
      // Only a real navigation to the staging MFA route satisfies this proof.
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
    '\nAI-17 hosted proof: complete the real Microsoft Authenticator challenge in this visible staging browser. The Planner journey continues after sign-in.\n',
  );
  await expect(page).toHaveURL(/\/overview(?:\?|$)/, { timeout: 5 * 60_000 });
  expect(manualMfaChallengeObserved).toBe(true);

  const profileFilters: Record<string, string> = { is_allowed: 'eq.true' };
  if (env.LIVE_E2E_EMAIL) profileFilters.email = `eq.${env.LIVE_E2E_EMAIL}`;
  const profiles = await serviceRows<{ id: string; is_allowed: boolean }>(
    'app_users',
    profileFilters,
    'id,is_allowed',
  );
  expect(profiles).toHaveLength(1);
  expect(profiles[0]?.is_allowed).toBe(true);
  const userId = profiles[0]!.id;

  await page.goto('/personal');
  const idempotencyKeyPromise = page
    .waitForRequest((request) => {
      if (request.method() !== 'POST' || !request.url().endsWith('/api/workflows/launch'))
        return false;
      try {
        return JSON.parse(request.postData() ?? '{}').workflowCode === 'personal-on-demand-plan';
      } catch {
        return false;
      }
    })
    .then((request) => {
      const body = JSON.parse(request.postData() ?? '{}') as { idempotencyKey?: unknown };
      if (typeof body.idempotencyKey !== 'string')
        throw new Error('Planner idempotency key was not captured.');
      return body.idempotencyKey;
    });
  const launchResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/workflows/launch',
  );
  await page
    .getByRole('textbox', { name: 'Purpose' })
    .fill('Plan a two-day Edinburgh visit from London using the Travel specialist.');
  await page
    .getByRole('textbox', { name: 'Constraints' })
    .fill('Use only available evidence. Do not book or purchase anything. State uncertainties.');
  await page.getByRole('button', { name: 'Queue plan' }).click();
  const [idempotencyKey, launchResponse] = await Promise.all([
    idempotencyKeyPromise,
    launchResponsePromise,
  ]);
  expect(launchResponse.status()).toBe(201);
  await expect(
    page.getByText('Request queued. Its approved cap and brief are retained with the run.'),
  ).toBeVisible();

  const launchedRuns = await serviceRows<WorkflowRun>(
    'workflow_runs',
    {
      user_id: `eq.${userId}`,
      idempotency_key: `eq.${idempotencyKey}`,
    },
    'id,status,correlation_id,idempotency_key',
  );
  expect(launchedRuns).toHaveLength(1);
  const journey = await waitForJourney(launchedRuns[0]!.id);
  expect(journey.sourceRun.status).toBe('succeeded');
  expect(journey.specialistRequest.status).toBe('completed');
  expect(journey.specialistRequest.correlation_id).toBe(journey.sourceRun.correlation_id);
  expect(journey.specialistRun.status).toBe('succeeded');
  expect(journey.specialistReply.kind).toBe('completed');
  expect(journey.specialistReply.correlation_id).toBe(journey.specialistRequest.correlation_id);
  expect(journey.specialistRequest.result_reference).toBe(journey.specialistReport.id);
  expect(journey.specialistReply.result_reference).toBe(journey.specialistReport.id);
  expect(journey.consolidatedReport.run_id).toBe(journey.sourceRun.id);

  const outputPath =
    process.env.LIVE_E2E_AI17_ACCEPTANCE_OUTPUT_PATH ??
    testInfo.outputPath('ai17-planner-specialist-acceptance.json');
  const evidence = {
    schemaVersion: 1,
    state: 'AI17_PLANNER_SPECIALIST_ACCEPTED',
    ticket: 'AI-17',
    candidateSha,
    candidateTreeSha,
    pullRequestNumber,
    deploymentRunId,
    stagingOrigin: stagingTarget.origin,
    acceptanceProfile: 'planner-specialist',
    manualMfaChallengeObserved,
    journey: {
      sourceRunId: journey.sourceRun.id,
      sourceCorrelationId: journey.sourceRun.correlation_id,
      specialistRequestId: journey.specialistRequest.id,
      specialistRunId: journey.specialistRun.id,
      specialistReplyId: journey.specialistReply.id,
      specialistReportId: journey.specialistReport.id,
      consolidatedReportId: journey.consolidatedReport.id,
      result: 'passed',
    },
    acceptedAt: new Date().toISOString(),
  };
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  await testInfo.attach('ai17-planner-specialist-acceptance.json', {
    path: outputPath,
    contentType: 'application/json',
  });
});
