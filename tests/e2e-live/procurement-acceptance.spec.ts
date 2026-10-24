import { createHash, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { parseLiveE2eEnvironment, stagingTarget } from '../../apps/web/lib/live-e2e-safety';
import { resolveGitTreeSha } from '../../infrastructure/scripts/live-acceptance-evidence.js';
import { writeProcurementStagingAcceptanceEvidence } from '../../infrastructure/scripts/procurement-live-acceptance.js';
import { readProcurementStagingRows } from '../../infrastructure/scripts/procurement-staging-reader.js';

type ResearchRun = {
  id: string;
  user_id: string;
  manager_code: string;
  hard_cap_minor: number;
  reserved_minor: number;
  search_limit: number;
  searches_used: number;
  status: string;
  request: ProcurementRequest;
  decision_record: ProcurementDecision | null;
  workflow_run_id: string | null;
  revises_research_run_id: string | null;
  report_id: string | null;
  created_at: string;
  completed_at: string | null;
};

type ProcurementRequirement =
  | { id: string; kind: 'hard'; label: string }
  | { id: string; kind: 'preference'; label: string; weight: number };

type ProcurementRequest = {
  item: string;
  purpose: string;
  market: string;
  currency: string;
  maxTotalCostMinor: number;
  requirements: ProcurementRequirement[];
  existingProducts: string[];
};

type ProcurementDecision = {
  item: string;
  currency: string;
  requirements: ProcurementRequirement[];
  rationale: string;
  candidates: Array<{
    id: string;
    title: string;
    offer: {
      itemPriceMinor: number | null;
      deliveryMinor: number | null;
      requiredAccessoriesMinor: number | null;
      mandatoryFeesMinor: number | null;
      observedAt: string | null;
      sourceUrls: string[];
    };
    assessments: Array<{
      requirementId: string;
      result: 'compatible' | 'incompatible' | 'unknown';
    }>;
  }>;
  comparison: Array<{
    candidateId: string;
    status: 'eligible' | 'excluded';
    totalCostMinor: number | null;
    exclusionReasons: string[];
  }>;
};

type WorkflowRun = { id: string; user_id: string; correlation_id: string; status: string };
type AiCall = { id: string; actual_cost: number | string | null; search_calls: number };

const env = parseLiveE2eEnvironment(process.env, 'procurement-acceptance');
const userId = process.env.LIVE_E2E_USER_ID;
const candidateSha = process.env.LIVE_E2E_CANDIDATE_SHA;
const candidateTreeSha = process.env.LIVE_E2E_CANDIDATE_TREE_SHA;
const pullRequestNumber = Number(process.env.LIVE_E2E_PULL_REQUEST_NUMBER);
const deploymentRunId = process.env.LIVE_E2E_DEPLOYMENT_RUN_ID;
const evidencePath = process.env.LIVE_E2E_ACCEPTANCE_OUTPUT_PATH;

function requiredUuid(value: string | undefined, label: string): string {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value))
    throw new Error(`${label} is missing or invalid.`);
  return value;
}

async function serviceRows<T>(table: string, query: URLSearchParams): Promise<T[]> {
  if (table === 'on_demand_research_runs') return readProcurementStagingRows<T>(query);
  const response = await fetch(
    `${env.LIVE_E2E_SUPABASE_URL}/rest/v1/${table}?${query.toString()}`,
    {
      headers: {
        apikey: env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!response.ok)
    throw new Error(`Staging ${table} evidence read failed with HTTP ${response.status}.`);
  return (await response.json()) as T[];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function usdToMicroUsd(value: number | string | null): number {
  if (value === null) throw new Error('A reconciled AI call is missing its actual cost.');
  const decimal = String(value);
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,6}))?$/.exec(decimal);
  if (!match) throw new Error('A reconciled AI call has an invalid or over-precision actual cost.');
  const whole = BigInt(match[1]!);
  const fraction = BigInt((match[2] ?? '').padEnd(6, '0') || '0');
  const microUsd = whole * 1_000_000n + fraction;
  if (microUsd > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('A reconciled AI call cost exceeds the evidence integer range.');
  return Number(microUsd);
}

async function readResearchRun(runId: string, targetUser: string): Promise<ResearchRun> {
  const query = new URLSearchParams({
    select:
      'id,user_id,manager_code,hard_cap_minor,reserved_minor,search_limit,searches_used,status,request,decision_record,workflow_run_id,revises_research_run_id,report_id,created_at,completed_at',
    id: `eq.${runId}`,
    user_id: `eq.${targetUser}`,
    manager_code: 'eq.procurement',
    limit: '2',
  });
  const rows = await serviceRows<ResearchRun>('on_demand_research_runs', query);
  if (rows.length !== 1)
    throw new Error('The allowlisted user’s Procurement research run is missing or ambiguous.');
  return rows[0]!;
}

async function waitForResearchRun(
  item: string,
  targetUser: string,
  createdAfter: string,
  revisesRunId?: string,
): Promise<ResearchRun> {
  const deadline = Date.now() + 4 * 60_000;
  while (Date.now() < deadline) {
    const query = new URLSearchParams({
      select:
        'id,user_id,manager_code,hard_cap_minor,reserved_minor,search_limit,searches_used,status,request,decision_record,workflow_run_id,revises_research_run_id,report_id,created_at,completed_at',
      user_id: `eq.${targetUser}`,
      manager_code: 'eq.procurement',
      'request->>item': `eq.${item}`,
      created_at: `gte.${createdAfter}`,
      order: 'created_at.desc',
      limit: '5',
    });
    if (revisesRunId) query.set('revises_research_run_id', `eq.${revisesRunId}`);
    const runs = await serviceRows<ResearchRun>('on_demand_research_runs', query);
    const match = runs.find((run) => run.status === 'complete' && run.decision_record !== null);
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error('The bounded Procurement workflow did not complete within four minutes.');
}

async function persistedRunEvidence(run: ResearchRun, targetUser: string) {
  if (!run.workflow_run_id || !run.completed_at || !run.report_id || !run.decision_record)
    throw new Error(
      'Completed Procurement run is missing its workflow, report, decision, or completion timestamp.',
    );
  const workflowQuery = new URLSearchParams({
    select: 'id,user_id,correlation_id,status',
    id: `eq.${run.workflow_run_id}`,
    user_id: `eq.${targetUser}`,
    limit: '2',
  });
  const workflows = await serviceRows<WorkflowRun>('workflow_runs', workflowQuery);
  if (workflows.length !== 1 || workflows[0]?.status !== 'succeeded')
    throw new Error(
      'The completed Procurement workflow is missing or not owned by the allowlisted user.',
    );
  const workflow = workflows[0]!;
  const callsQuery = new URLSearchParams({
    select: 'id,actual_cost,search_calls',
    run_id: `eq.${workflow.id}`,
    user_id: `eq.${targetUser}`,
    order: 'created_at.asc',
    limit: '20',
  });
  const calls = await serviceRows<AiCall>('ai_calls', callsQuery);
  if (calls.length < 1)
    throw new Error('Persisted AI call cost evidence is missing for the Procurement run.');
  const actualCostMicroUsd = calls.reduce(
    (sum, call) => sum + BigInt(usdToMicroUsd(call.actual_cost)),
    0n,
  );
  const searchCalls = calls.reduce((sum, call) => sum + call.search_calls, 0);
  if (run.hard_cap_minor !== 25 || run.search_limit !== 3 || run.searches_used > 3)
    throw new Error(
      'The persisted Procurement run exceeded the configured acceptance cap or search ceiling.',
    );
  if (actualCostMicroUsd > 250_000n || searchCalls > 3)
    throw new Error(
      'Persisted Procurement provider cost or search usage exceeded its per-run cap.',
    );
  return {
    workflow,
    actualCostMicroUsd: Number(actualCostMicroUsd),
    searchCalls,
    aiCallCount: calls.length,
  };
}

function totalMinor(candidate: ProcurementDecision['candidates'][number]): number | null {
  const { itemPriceMinor, deliveryMinor, requiredAccessoriesMinor, mandatoryFeesMinor } =
    candidate.offer;
  if (
    itemPriceMinor === null ||
    deliveryMinor === null ||
    requiredAccessoriesMinor === null ||
    mandatoryFeesMinor === null
  )
    return null;
  const total =
    BigInt(itemPriceMinor) +
    BigInt(deliveryMinor) +
    BigInt(requiredAccessoriesMinor) +
    BigInt(mandatoryFeesMinor);
  return total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : null;
}

test('AI-39 persisted Procurement acceptance: comparison, revision lineage, and denied action', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(15 * 60_000);
  const targetUser = requiredUuid(userId, 'LIVE_E2E_USER_ID');
  expect(candidateSha).toMatch(/^[a-f0-9]{40}$/i);
  expect(candidateTreeSha).toMatch(/^[a-f0-9]{40}$/i);
  expect(pullRequestNumber).toBeGreaterThan(0);
  expect(deploymentRunId).toMatch(/^[1-9][0-9]{0,19}$/);
  expect(evidencePath).toBeTruthy();
  expect(resolveGitTreeSha(candidateSha!)).toBe(candidateTreeSha);

  const releaseResponse = await page.request.get(
    new URL('/api/release', env.LIVE_E2E_BASE_URL).href,
  );
  expect(releaseResponse.status()).toBe(200);
  expect(await releaseResponse.json()).toEqual({
    schemaVersion: 1,
    releaseSha: candidateSha!.toLowerCase(),
  });

  let manualMfaChallengeObserved = false;
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    try {
      if (new URL(frame.url()).pathname === '/mfa') manualMfaChallengeObserved = true;
    } catch {
      // Only a real staging MFA route navigation satisfies the human checkpoint.
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
    '\nComplete the real staging Microsoft Authenticator challenge in this browser. The Procurement acceptance resumes after sign-in.\n',
  );
  await expect(page).toHaveURL(/\/overview(?:\?|$)/, { timeout: 5 * 60_000 });
  expect(manualMfaChallengeObserved).toBe(true);

  const invalidActionKey = randomUUID();
  const deniedAction = await page.evaluate(async (idempotencyKey) => {
    const response = await fetch('/api/workflows/launch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workflowCode: 'procurement-buy',
        managerCode: 'procurement',
        hardCapUsd: 0.01,
        searchCeiling: 1,
        modelCeiling: 'gpt-5.6-luna',
        idempotencyKey,
        request: {},
      }),
    });
    return { status: response.status, body: (await response.json()) as { code?: string } };
  }, invalidActionKey);
  expect(deniedAction).toMatchObject({ status: 400, body: { code: 'invalid_launch_request' } });
  const deniedRunQuery = new URLSearchParams({
    select: 'id',
    idempotency_key: `eq.${invalidActionKey}`,
    user_id: `eq.${targetUser}`,
    limit: '2',
  });
  expect(await serviceRows<{ id: string }>('workflow_runs', deniedRunQuery)).toHaveLength(0);

  await page.goto('/procurement');
  await expect(page.getByRole('heading', { name: 'Consumer & Procurement' })).toBeVisible();
  await expect(
    page.getByText('It does not submit an order or payment.', { exact: true }),
  ).toBeVisible();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const item = `AI-39 acceptance charger ${stamp}`;
  const initialItem = page.getByLabel('Item or service');
  const form = page.locator('form').filter({ has: initialItem });
  await initialItem.fill(item);
  await form
    .getByLabel('What do you need it for?')
    .fill('Compare UK USB-C chargers against the saved requirements.');
  await form.getByLabel('Market or country').fill('United Kingdom');
  await form.getByLabel('Currency').selectOption('GBP');
  await form.getByLabel('Maximum all-in product cost').fill('70');
  await form
    .getByLabel('Hard requirements, one per line')
    .fill('At least 100 W USB-C Power Delivery from one port\nUK Type G plug included');
  await form.getByLabel('Preferences, one per line').fill('Two USB-C outputs');
  await form.getByLabel('Products or equipment you already own, one per line').fill('');
  await form.getByLabel('Hard cap (USD)').fill('0.25');
  await form.getByLabel('Search ceiling').fill('3');
  const initialCreatedAfter = new Date().toISOString();
  await form.getByRole('button', { name: 'Queue research' }).click();
  await expect(form.getByRole('status')).toContainText('Request queued');
  const initialRun = await waitForResearchRun(item, targetUser, initialCreatedAfter);
  expect(initialRun.user_id).toBe(targetUser);
  expect(initialRun.manager_code).toBe('procurement');
  expect(initialRun.created_at < initialRun.completed_at!).toBe(true);
  expect(initialRun.request).toMatchObject({ item, currency: 'GBP', maxTotalCostMinor: 7000 });
  expect(initialRun.decision_record).not.toBeNull();
  const initialDecision = initialRun.decision_record!;
  expect(initialDecision.requirements).toEqual(initialRun.request.requirements);
  expect(initialDecision.rationale.trim().length).toBeGreaterThan(0);
  const initialCostEvidence = await persistedRunEvidence(initialRun, targetUser);

  await page.reload();
  const initialCard = page.locator(`#procurement-run-${initialRun.id}`);
  await expect(
    initialCard.getByRole('heading', { name: new RegExp(`${item} — complete`) }),
  ).toBeVisible();
  await expect(
    initialCard.getByRole('heading', { name: 'Requirements saved before ranking' }),
  ).toBeVisible();
  await expect(initialCard.getByRole('heading', { name: 'Candidate comparison' })).toBeVisible();
  await expect(initialCard.getByText(initialDecision.rationale, { exact: true })).toBeVisible();
  expect(
    await initialCard.evaluate((card) => {
      const requirements = card.querySelector('h4');
      const comparison = [...card.querySelectorAll('h4')].find(
        (heading) => heading.textContent === 'Candidate comparison',
      );
      return Boolean(
        requirements &&
          comparison &&
          requirements.compareDocumentPosition(comparison) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }),
  ).toBe(true);

  const excluded = initialDecision.comparison.find(
    (result) => result.status === 'excluded' && result.exclusionReasons.length > 0,
  );
  expect(excluded).toBeTruthy();
  const ineligibleCandidate = initialDecision.candidates.find(
    (candidate) => candidate.id === excluded!.candidateId,
  )!;
  const unknownPair = initialDecision.candidates.flatMap((candidate) =>
    candidate.assessments
      .filter((assessment) => assessment.result === 'unknown')
      .map((assessment) => ({ candidate, assessment })),
  )[0];
  expect(unknownPair).toBeTruthy();
  const ineligibleRow = initialCard
    .locator('tbody tr')
    .filter({ hasText: ineligibleCandidate.title });
  await expect(ineligibleRow).toContainText('Excluded:');
  const unknownRequirement = initialDecision.requirements.find(
    (requirement) => requirement.id === unknownPair!.assessment.requirementId,
  );
  expect(unknownRequirement).toBeTruthy();
  const unknownCandidate = unknownPair!.candidate;
  await expect(
    initialCard.locator('tbody tr').filter({ hasText: unknownCandidate.title }),
  ).toContainText(`${unknownRequirement!.label}: unknown`);

  const allInCandidate = initialDecision.candidates.find((candidate) => {
    const result = initialDecision.comparison.find((entry) => entry.candidateId === candidate.id);
    return (
      result?.status === 'eligible' &&
      result.totalCostMinor !== null &&
      totalMinor(candidate) === result.totalCostMinor
    );
  });
  expect(allInCandidate).toBeTruthy();
  const allInResult = initialDecision.comparison.find(
    (entry) => entry.candidateId === allInCandidate!.id,
  )!;
  const observationCandidates = initialDecision.candidates
    .map((candidate) => ({ candidate, total: totalMinor(candidate) }))
    .filter(
      (entry) =>
        entry.total !== null &&
        entry.candidate.offer.observedAt !== null &&
        entry.candidate.offer.sourceUrls.length > 0,
    );
  const sourceA = observationCandidates[0];
  const sourceB = observationCandidates.find(
    (entry) => entry.candidate.id !== sourceA?.candidate.id && entry.total !== sourceA?.total,
  );
  expect(sourceA).toBeTruthy();
  expect(sourceB, 'two dated sources with conflicting totals are required').toBeTruthy();
  for (const observed of [sourceA!, sourceB!]) {
    const observedRow = initialCard
      .locator('tbody tr')
      .filter({ hasText: observed.candidate.title });
    await expect(observedRow).toContainText('Retrieved');
    await expect(observedRow).toContainText(
      new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: initialDecision.currency,
      }).format(observed.total! / 100),
    );
  }
  const allInRow = initialCard.locator('tbody tr').filter({ hasText: allInCandidate!.title });
  await expect(allInRow).toContainText(
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: initialDecision.currency,
    }).format(allInResult.totalCostMinor! / 100),
  );

  await initialCard.getByText('Revise this request', { exact: true }).click();
  const revisionForm = initialCard
    .locator('form')
    .filter({ has: initialCard.getByLabel('Item or service') });
  await revisionForm
    .getByLabel('Hard requirements, one per line')
    .fill('At least 140 W USB-C Power Delivery from one port\nUK Type G plug included');
  const revisionCreatedAfter = new Date().toISOString();
  await revisionForm.getByRole('button', { name: 'Re-run with revised requirements' }).click();
  await expect(revisionForm.getByRole('status')).toContainText('Revised request queued');
  const revisedRun = await waitForResearchRun(
    item,
    targetUser,
    revisionCreatedAfter,
    initialRun.id,
  );
  expect(revisedRun.revises_research_run_id).toBe(initialRun.id);
  expect(revisedRun.request.requirements).not.toEqual(initialRun.request.requirements);
  expect(revisedRun.decision_record).not.toBeNull();
  const revisedCostEvidence = await persistedRunEvidence(revisedRun, targetUser);
  const priorRunAfterRevision = await readResearchRun(initialRun.id, targetUser);
  expect(stableJson(priorRunAfterRevision.decision_record)).toBe(stableJson(initialDecision));
  expect(priorRunAfterRevision.report_id).toBe(initialRun.report_id);
  expect(priorRunAfterRevision.status).toBe('complete');
  await page.reload();
  await expect(page.locator(`#procurement-run-${revisedRun.id}`)).toContainText('Revised from');
  await expect(page.locator(`#procurement-run-${revisedRun.id}`)).toContainText(
    'its decision and evidence remain available',
  );

  const outputPath = evidencePath!;
  await writeProcurementStagingAcceptanceEvidence(outputPath, {
    schemaVersion: 1,
    state: 'PROCUREMENT_STAGING_ACCEPTED',
    acceptanceProfile: 'procurement',
    candidateSha: candidateSha!.toLowerCase(),
    candidateTreeSha: candidateTreeSha!.toLowerCase(),
    pullRequestNumber,
    deploymentRunId,
    stagingOrigin: stagingTarget.origin,
    humanMfa: 'user-completed',
    correlationIds: [
      initialCostEvidence.workflow.correlation_id,
      revisedCostEvidence.workflow.correlation_id,
    ],
    acceptedAt: new Date().toISOString(),
    checks: {
      releaseVersion: 'passed',
      requirementsPersistedBeforeRanking: 'passed',
      eligibilityAndUnknownHandling: 'passed',
      allInTotalsAndDatedConflictingSources: 'passed',
      revisionPreservesPriorProvenance: 'passed',
      persistedRationale: 'passed',
      purchasePaymentDenied: 'passed',
      chromium: 'passed',
    },
    runs: [
      {
        researchRunId: initialRun.id,
        workflowRunId: initialRun.workflow_run_id!,
        correlationId: initialCostEvidence.workflow.correlation_id,
        status: 'complete',
        hardCapMicroUsd: 250_000,
        actualCostMicroUsd: initialCostEvidence.actualCostMicroUsd,
        searchLimit: initialRun.search_limit,
        searchesUsed: initialRun.searches_used,
        aiCallCount: initialCostEvidence.aiCallCount,
      },
      {
        researchRunId: revisedRun.id,
        workflowRunId: revisedRun.workflow_run_id!,
        correlationId: revisedCostEvidence.workflow.correlation_id,
        status: 'complete',
        hardCapMicroUsd: 250_000,
        actualCostMicroUsd: revisedCostEvidence.actualCostMicroUsd,
        searchLimit: revisedRun.search_limit,
        searchesUsed: revisedRun.searches_used,
        aiCallCount: revisedCostEvidence.aiCallCount,
      },
    ],
    revision: {
      originalResearchRunId: initialRun.id,
      revisedResearchRunId: revisedRun.id,
      linkedToOriginal: true,
      priorDecisionPreserved: true,
      requirementsChanged: true,
      priorDecisionSha256: createHash('sha256').update(stableJson(initialDecision)).digest('hex'),
    },
    comparison: {
      requirements: initialDecision.requirements.map(({ id, kind }) => ({ id, kind })),
      ineligibleCandidateId: ineligibleCandidate.id,
      exclusionReasonCount: excluded!.exclusionReasons.length,
      exclusionReasonsSha256: createHash('sha256')
        .update(stableJson(excluded!.exclusionReasons))
        .digest('hex'),
      unknownCandidateId: unknownPair!.candidate.id,
      unknownRequirementId: unknownPair!.assessment.requirementId,
      sourceA: {
        candidateId: sourceA!.candidate.id,
        sourceHost: new URL(sourceA!.candidate.offer.sourceUrls[0]!).hostname,
        observedAt: sourceA!.candidate.offer.observedAt!,
        totalMinor: sourceA!.total!,
      },
      sourceB: {
        candidateId: sourceB!.candidate.id,
        sourceHost: new URL(sourceB!.candidate.offer.sourceUrls[0]!).hostname,
        observedAt: sourceB!.candidate.offer.observedAt!,
        totalMinor: sourceB!.total!,
      },
      currency: initialDecision.currency,
      allIn: {
        itemMinor: allInCandidate!.offer.itemPriceMinor!,
        deliveryMinor: allInCandidate!.offer.deliveryMinor!,
        accessoriesMinor: allInCandidate!.offer.requiredAccessoriesMinor!,
        mandatoryFeesMinor: allInCandidate!.offer.mandatoryFeesMinor!,
        totalMinor: allInResult.totalCostMinor!,
      },
      rationaleSha256: createHash('sha256').update(initialDecision.rationale).digest('hex'),
    },
    actionDenial: { status: 400, code: 'invalid_launch_request', noWorkflowCreated: true },
  });
});
