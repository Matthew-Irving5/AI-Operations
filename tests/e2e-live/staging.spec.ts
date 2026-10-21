import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { expect, test, webkit } from '@playwright/test';
import { parseLiveE2eEnvironment } from '../../apps/web/lib/live-e2e-safety';
import { writeLiveStagingAcceptanceEvidence } from '../../infrastructure/scripts/live-acceptance-evidence.js';
import { liveAuthScheduleAction } from '../../infrastructure/scripts/live-auth-schedule-action.js';
import {
  systemsLaunchRequest,
  type SystemsModelRoute,
  type SystemsWorkflowCode,
} from '../support/systems-launch-request';

const env = parseLiveE2eEnvironment(process.env, 'suite');
const stagingResponses = new WeakMap<import('@playwright/test').Page, string[]>();
type ModelRoute = SystemsModelRoute;
let manualMfaChallengeObserved = false;

function redactError(message: string): string {
  let redacted = message;
  for (const secret of [
    env.LIVE_E2E_PASSWORD,
    env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY,
    env.LIVE_E2E_EMAIL,
  ].filter((value): value is string => Boolean(value))) {
    redacted = redacted.replaceAll(secret, '[REDACTED]');
  }
  return redacted
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/([?&][^=\s"'<>]+)=([^&\s"'<>]*)/g, '$1=[REDACTED]')
    .replace(/\b\d{6}\b/g, '[REDACTED-CODE]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27}\b/gi, '[REDACTED-ID]')
    .slice(0, 500);
}

test.beforeEach(async ({ page }) => {
  manualMfaChallengeObserved = false;
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    try {
      if (new URL(frame.url()).pathname === '/mfa') manualMfaChallengeObserved = true;
    } catch {
      // Ignore non-URL navigations; only the staging MFA route can satisfy acceptance.
    }
  });
  const summaries: string[] = [];
  stagingResponses.set(page, summaries);
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === new URL(env.LIVE_E2E_BASE_URL).origin && url.pathname.startsWith('/api/')) {
      summaries.push(`${response.request().method()} ${url.pathname} ${response.status()}`);
      if (url.pathname === '/api/auth/mfa/verify') {
        void response
          .json()
          .then((body: unknown) => {
            if (typeof body !== 'object' || body === null) return;
            const diagnostic = (body as { diagnostic?: unknown }).diagnostic;
            if (typeof diagnostic !== 'object' || diagnostic === null) return;
            const safeDiagnostic = diagnostic as {
              code?: unknown;
              stage?: unknown;
              validationIssues?: unknown;
            };
            const issues = Array.isArray(safeDiagnostic.validationIssues)
              ? safeDiagnostic.validationIssues.filter(
                  (issue): issue is { path: string; code: string } =>
                    typeof issue === 'object' &&
                    issue !== null &&
                    typeof (issue as { path?: unknown }).path === 'string' &&
                    typeof (issue as { code?: unknown }).code === 'string',
                )
              : [];
            summaries.push(
              `MFA diagnostic code=${String(safeDiagnostic.code)} stage=${String(safeDiagnostic.stage)} issues=${issues.map(({ path, code }) => `${path}:${code}`).join(',') || 'none'}`,
            );
          })
          .catch(() => summaries.push('MFA diagnostic response was not JSON.'));
      }
    }
  });
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const screenshot = testInfo.outputPath('failure-redacted.png');
  const safeScreenshotRoutes = new Set(['/login', '/mfa', '/travel', '/operations']);
  let screenshotCaptured = false;
  try {
    if (safeScreenshotRoutes.has(new URL(page.url()).pathname)) {
      await page.screenshot({
        path: screenshot,
        fullPage: true,
        mask: [
          page.locator('input, textarea, header, nav, article'),
          ...(env.LIVE_E2E_EMAIL ? [page.getByText(env.LIVE_E2E_EMAIL, { exact: true })] : []),
        ],
        maskColor: '#242424',
        timeout: 5_000,
      });
      screenshotCaptured = true;
    }
  } catch {
    // A screenshot is optional if the browser has already closed or the route is unsafe.
  }
  if (screenshotCaptured) {
    await testInfo.attach('failure-redacted.png', { path: screenshot, contentType: 'image/png' });
  }
  const diagnosticTrace = {
    test: testInfo.title,
    status: testInfo.status,
    browser: testInfo.project.name,
    route: (() => {
      try {
        return new URL(page.url()).pathname;
      } catch {
        return 'unavailable';
      }
    })(),
    responses: (stagingResponses.get(page) ?? []).slice(-80),
    errors: testInfo.errors.map((error) => ({
      message: redactError(error.message ?? 'Unknown failure'),
    })),
  };
  const tracePath = testInfo.outputPath('failure-redacted-trace.json');
  await writeFile(tracePath, JSON.stringify(diagnosticTrace, null, 2), 'utf8');
  await testInfo.attach('failure-redacted-trace.json', {
    path: tracePath,
    contentType: 'application/json',
  });
});

async function signInWithFreshMfa(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'AI Operations' })).toBeVisible();
  if (env.LIVE_E2E_EMAIL && env.LIVE_E2E_PASSWORD) {
    await page.getByLabel('Email').fill(env.LIVE_E2E_EMAIL);
    await page.getByLabel('Password').fill(env.LIVE_E2E_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/mfa(?:\?|$)/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Verify your identity' })).toBeVisible();
    process.stdout.write(
      '\nManual MFA checkpoint: complete the real challenge in this open staging browser. The same browser journey resumes automatically after sign-in.\n',
    );
  } else {
    process.stdout.write(
      '\nManual sign-in checkpoint: use this separate Chrome for Testing window, not the in-chat browser. Sign into the staging account here and complete Microsoft Authenticator when the MFA page appears. This same browser journey resumes automatically after Overview loads.\n',
    );
  }
  await expect(page).toHaveURL(/\/overview(?:\?|$)/, { timeout: 5 * 60_000 });
  if (!manualMfaChallengeObserved) {
    throw new Error(
      'Hosted acceptance requires observing the real staging MFA challenge in this browser.',
    );
  }
}

async function serviceRows<T>(table: string, query: string): Promise<T[]> {
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

async function postAgentRuntime(
  page: import('@playwright/test').Page,
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return page.evaluate(async (payload) => {
    const response = await fetch('/api/agent-runtime/contracts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
    };
  }, body);
}

async function postPromptGovernance(
  page: import('@playwright/test').Page,
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return page.evaluate(async (payload) => {
    const response = await fetch('/api/prompt-governance', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result: unknown = await response.json();
    return {
      status: response.status,
      body:
        typeof result === 'object' && result !== null && !Array.isArray(result)
          ? (result as Record<string, unknown>)
          : {},
    };
  }, body);
}

type SystemsWorkflowProof = {
  workflowCode: SystemsWorkflowCode;
  executionMode: 'deterministic' | 'ai';
  runId: string;
  correlationId: string;
  reportId: string;
  status: 'succeeded';
  model: 'none' | ModelRoute;
  aiCallCount: number;
  actualCostUsd: number;
  hardCapUsd: number;
  inputTokens: number;
  outputTokens: number;
  searchCalls: number;
  notificationDelivery: 'not_sent';
};

async function launchSystemsWorkflow(
  page: import('@playwright/test').Page,
  workflowCode: SystemsWorkflowProof['workflowCode'],
  hardCapUsd: number,
  modelCeiling: ModelRoute = 'gpt-5.6-luna',
): Promise<{ runId: string; idempotencyKey: string }> {
  const idempotencyKey = randomUUID();
  const body = systemsLaunchRequest({ workflowCode, hardCapUsd, modelCeiling, idempotencyKey });
  const result = await page.evaluate(async (requestBody) => {
    const response = await fetch('/api/workflows/launch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    return {
      status: response.status,
      body: (await response.json()) as { runId?: string; code?: string },
    };
  }, body);
  expect(result.status, `Systems launch failed: ${result.body.code ?? 'unknown'}`).toBe(201);
  expect(result.body.runId).toMatch(/^[0-9a-f-]{36}$/i);
  return { runId: result.body.runId!, idempotencyKey };
}

async function waitForSuccessfulRun(runId: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await serviceRows<{ status: string; error_code: string | null }>(
      'workflow_runs',
      `select=status,error_code&id=eq.${runId}`,
    );
    const status = rows[0]?.status;
    if (status === 'succeeded') return;
    if (status === 'failed' || status === 'dead_letter' || status === 'cancelled') {
      throw new Error(
        `Systems workflow ${runId} reached ${status} (${rows[0]?.error_code ?? 'no_code'}).`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(
    `Systems workflow ${runId} did not reach success before the bounded wait expired.`,
  );
}

async function assertResponsesBudgetPreflight(
  modelRoute: ModelRoute,
  hardCapUsd: number,
): Promise<void> {
  const models = await serviceRows<{ id: string; model_id: string; enabled: boolean }>(
    'ai_model_catalog',
    `select=id,model_id,enabled&model_id=eq.${modelRoute}`,
  );
  expect(models).toHaveLength(1);
  expect(models[0]).toMatchObject({ model_id: modelRoute, enabled: true });
  const pricing = await serviceRows<{
    input_per_million: number | string;
    output_per_million: number | string;
    web_search_per_call: number | string;
  }>(
    'model_pricing',
    `select=input_per_million,output_per_million,web_search_per_call&model_id=eq.${models[0]!.id}&effective_from=lte.${encodeURIComponent(new Date().toISOString())}&order=effective_from.desc&limit=1`,
  );
  expect(pricing).toHaveLength(1);
  const estimatedCost =
    Math.ceil(
      ((8_000 * Number(pricing[0]!.input_per_million) +
        2_000 * Number(pricing[0]!.output_per_million)) /
        1_000_000) *
        1_000_000,
    ) / 1_000_000;
  expect(Number(pricing[0]!.web_search_per_call)).toBeGreaterThanOrEqual(0);
  expect(estimatedCost).toBeGreaterThan(0);
  expect(estimatedCost).toBeLessThanOrEqual(hardCapUsd);
  expect(estimatedCost).toBeLessThan(2);
}

async function proveSystemsWorkflow(
  page: import('@playwright/test').Page,
  workflowCode: SystemsWorkflowProof['workflowCode'],
  executionMode: SystemsWorkflowProof['executionMode'],
  hardCapUsd: number,
  modelCeiling: ModelRoute = 'gpt-5.6-luna',
  expectedPrompt?: {
    id: string;
    modelRoute: ModelRoute;
    schemaVersion: number;
    toolPolicyVersion: number;
  },
): Promise<SystemsWorkflowProof> {
  if (executionMode === 'ai') await assertResponsesBudgetPreflight(modelCeiling, hardCapUsd);
  const { runId, idempotencyKey } = await launchSystemsWorkflow(
    page,
    workflowCode,
    hardCapUsd,
    modelCeiling,
  );
  await waitForSuccessfulRun(runId, executionMode === 'ai' ? 8 * 60_000 : 2 * 60_000);
  const runIdentity = await serviceRows<{ correlation_id: string }>(
    'workflow_runs',
    `select=correlation_id&id=eq.${runId}`,
  );
  expect(runIdentity).toHaveLength(1);
  const correlationId = runIdentity[0]!.correlation_id;

  const [runs, jobs, reports, calls, notifications, budgets] = await Promise.all([
    serviceRows<{
      id: string;
      status: string;
      trigger: string;
      correlation_id: string;
      idempotency_key: string;
    }>('workflow_runs', `select=id,status,trigger,correlation_id,idempotency_key&id=eq.${runId}`),
    serviceRows<{ status: string }>('job_queue', `select=status&run_id=eq.${runId}`),
    serviceRows<{
      id: string;
      structured_metrics: Record<string, unknown>;
    }>('reports', `select=id,structured_metrics&run_id=eq.${runId}`),
    serviceRows<{
      id: string;
      status: string;
      model_id: string;
      actual_cost: number | string;
      actual_input_tokens: number;
      actual_output_tokens: number;
      search_calls: number;
      run_id: string;
      prompt_version_id: string;
      schema_version: number;
      tool_policy_version: number;
      model_route: ModelRoute;
    }>(
      'ai_calls',
      `select=id,status,model_id,actual_cost,actual_input_tokens,actual_output_tokens,search_calls,run_id,prompt_version_id,schema_version,tool_policy_version,model_route&run_id=eq.${runId}`,
    ),
    serviceRows<{ status: string; type: string }>(
      'notifications',
      `select=status,type&dedupe_key=eq.workflow-report:${runId}`,
    ),
    serviceRows<{
      hard_cap: number | string;
      reserved_amount: number | string;
      model_ceiling: string;
      search_ceiling: number;
      status: string;
    }>(
      'on_demand_budgets',
      `select=hard_cap,reserved_amount,model_ceiling,search_ceiling,status&run_id=eq.${runId}`,
    ),
  ]);

  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({
    id: runId,
    status: 'succeeded',
    trigger: 'on_demand',
    idempotency_key: idempotencyKey,
  });
  expect(jobs).toEqual([{ status: 'succeeded' }]);
  expect(reports).toHaveLength(1);

  await page.goto(new URL('/reports', env.LIVE_E2E_BASE_URL).href);
  const reportTitle =
    executionMode === 'deterministic'
      ? 'Systems platform report'
      : 'Validated AI Operations report';
  const reportCard = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: reportTitle, exact: true }) })
    .first();
  await expect(reportCard.locator('.label')).toContainText('validated');

  await page.goto(new URL('/ai-traces-audit', env.LIVE_E2E_BASE_URL).href);
  const correlatedTraceCards = page.getByRole('article').filter({ hasText: correlationId });
  const requiredTraceEvents =
    executionMode === 'deterministic'
      ? ['workflow_completed', 'workflow_notification_decision']
      : ['ai_report_validated', 'ai_call_settled', 'workflow_notification_decision'];
  for (const eventType of requiredTraceEvents) {
    await expect(
      correlatedTraceCards.filter({
        has: page.getByRole('heading', { name: eventType, exact: true }),
      }),
    ).toHaveCount(1);
  }

  if (executionMode === 'deterministic') {
    expect(reports[0]?.structured_metrics).toMatchObject({
      workflow: workflowCode,
      deterministic: true,
    });
    expect(budgets).toHaveLength(1);
    expect(budgets[0]).toMatchObject({
      hard_cap: hardCapUsd,
      model_ceiling: 'gpt-5.6-luna',
      reserved_amount: 0,
      search_ceiling: 0,
      status: 'active',
    });
    expect(calls).toHaveLength(0);
    expect(reports[0]?.structured_metrics).toMatchObject({
      execution_mode: 'deterministic',
      ai_called: false,
      validation: 'passed',
    });
  } else {
    expect(reports[0]?.structured_metrics).toMatchObject({ validation: 'passed' });
    expect(budgets).toHaveLength(1);
    expect(budgets[0]).toMatchObject({
      hard_cap: hardCapUsd,
      model_ceiling: modelCeiling,
      search_ceiling: 0,
      status: 'active',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ status: 'succeeded', search_calls: 0 });
    if (expectedPrompt) {
      expect(calls[0]).toMatchObject({
        prompt_version_id: expectedPrompt.id,
        model_route: expectedPrompt.modelRoute,
        schema_version: expectedPrompt.schemaVersion,
        tool_policy_version: expectedPrompt.toolPolicyVersion,
      });
    }
    expect(Number(calls[0]?.actual_cost)).toBeGreaterThan(0);
    expect(Number(calls[0]?.actual_cost)).toBeLessThanOrEqual(hardCapUsd);
    expect(Number(reports[0]?.structured_metrics.actual_cost)).toBeCloseTo(
      Number(calls[0]?.actual_cost),
      6,
    );
    expect(calls[0]?.actual_input_tokens).toBeGreaterThan(0);
    expect(calls[0]?.actual_output_tokens).toBeGreaterThan(0);
    const modelRows = await serviceRows<{ model_id: string }>(
      'ai_model_catalog',
      `select=model_id&id=eq.${calls[0]!.model_id}`,
    );
    expect(modelRows).toEqual([{ model_id: modelCeiling }]);
    expect(reports[0]?.structured_metrics).toHaveProperty('ai_call_id', calls[0]?.id);
  }
  expect(notifications).toHaveLength(1);
  expect(notifications[0]?.status).toBe('pending');

  return {
    workflowCode,
    executionMode,
    runId,
    correlationId,
    reportId: reports[0]!.id,
    status: 'succeeded',
    model: executionMode === 'ai' ? modelCeiling : 'none',
    aiCallCount: calls.length,
    actualCostUsd: executionMode === 'ai' ? Number(calls[0]?.actual_cost) : 0,
    hardCapUsd,
    inputTokens: executionMode === 'ai' ? calls[0]!.actual_input_tokens : 0,
    outputTokens: executionMode === 'ai' ? calls[0]!.actual_output_tokens : 0,
    searchCalls: executionMode === 'ai' ? calls[0]!.search_calls : 0,
    notificationDelivery: 'not_sent',
  };
}

type PromptVersionRow = {
  id: string;
  version: number;
  system_text: string;
  developer_text: string;
  json_schema: unknown;
  model_route: ModelRoute;
  schema_version: number;
  tool_policy_version: number;
  tool_policy: unknown;
  evaluation_status: string;
};

type PromptTransitionResult = {
  active_version?: number;
  previous_version?: number;
  replayed?: boolean;
};

type GovernedAiCallRow = {
  id: string;
  run_id: string;
  prompt_version_id: string;
  model_route: ModelRoute;
  schema_version: number;
  tool_policy_version: number;
  search_calls: number;
  actual_cost: number | string;
};

async function readCurrentSystemsPrompt(page: import('@playwright/test').Page) {
  const response = await postPromptGovernance(page, { operation: 'get_current' });
  expect(response.status, `get_current failed: ${String(response.body.code ?? 'unknown')}`).toBe(
    200,
  );
  const current = response.body as {
    templateId?: unknown;
    activeVersion?: unknown;
    schema?: unknown;
    modelRoute?: unknown;
    schemaVersion?: unknown;
    toolPolicyVersion?: unknown;
    toolPolicy?: unknown;
  };
  expect(current.templateId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(Number.isSafeInteger(current.activeVersion)).toBe(true);
  expect(['gpt-5.6-luna', 'gpt-5.6-terra']).toContain(current.modelRoute);
  return current as {
    templateId: string;
    activeVersion: number;
    schema: unknown;
    modelRoute: ModelRoute;
    schemaVersion: number;
    toolPolicyVersion: number;
    toolPolicy: unknown;
  };
}

async function readGovernedAiCall(runId: string): Promise<GovernedAiCallRow> {
  const rows = await serviceRows<GovernedAiCallRow>(
    'ai_calls',
    `select=id,run_id,prompt_version_id,model_route,schema_version,tool_policy_version,search_calls,actual_cost&run_id=eq.${runId}`,
  );
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

async function transitionSystemsPrompt(
  page: import('@playwright/test').Page,
  operation: 'promote' | 'rollback',
  templateId: string,
  targetVersion: number,
  expectedActiveVersion: number,
  idempotencyKey: string,
): Promise<PromptTransitionResult> {
  const response = await postPromptGovernance(page, {
    operation,
    templateId,
    targetVersion,
    expectedActiveVersion,
    idempotencyKey,
  });
  expect(response.status, `${operation} failed: ${String(response.body.code ?? 'unknown')}`).toBe(
    200,
  );
  return response.body as PromptTransitionResult;
}

async function proveAi16PromptGovernance(page: import('@playwright/test').Page): Promise<{
  candidateRun: SystemsWorkflowProof;
  postRollbackRun: SystemsWorkflowProof;
  evidence: Record<string, unknown>;
}> {
  const current = await readCurrentSystemsPrompt(page);
  const currentVersions = await serviceRows<PromptVersionRow>(
    'prompt_versions',
    `select=id,version,system_text,developer_text,json_schema,model_route,schema_version,tool_policy_version,tool_policy,evaluation_status&template_id=eq.${current.templateId}&version=eq.${current.activeVersion}`,
  );
  expect(currentVersions).toHaveLength(1);
  const previous = currentVersions[0]!;
  expect(previous.id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(previous.evaluation_status).toMatch(/^(approved|promoted)$/);
  expect(previous.model_route).toBe(current.modelRoute);
  expect(previous.schema_version).toBe(current.schemaVersion);
  expect(previous.tool_policy_version).toBe(current.toolPolicyVersion);
  expect(previous.json_schema).toEqual(current.schema);
  expect(previous.tool_policy).toEqual(current.toolPolicy);

  const candidateHardCapUsd = 0.05;
  const rollbackHardCapUsd = current.modelRoute === 'gpt-5.6-luna' ? 0.05 : 0.15;
  await assertResponsesBudgetPreflight('gpt-5.6-luna', candidateHardCapUsd);
  await assertResponsesBudgetPreflight(current.modelRoute, rollbackHardCapUsd);

  const created = await postPromptGovernance(page, {
    operation: 'create_candidate',
    templateId: current.templateId,
    systemText: previous.system_text,
    developerText: previous.developer_text,
    schema: previous.json_schema,
    modelRoute: 'gpt-5.6-luna',
    schemaVersion: previous.schema_version,
    toolPolicyVersion: previous.tool_policy_version,
    toolPolicy: previous.tool_policy,
  });
  expect(
    created.status,
    `candidate creation failed: ${String(created.body.code ?? 'unknown')}`,
  ).toBe(201);
  const createdCandidate = created.body as { candidateId?: unknown; version?: unknown };
  expect(createdCandidate.candidateId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(Number.isSafeInteger(createdCandidate.version)).toBe(true);
  const candidateId = createdCandidate.candidateId as string;
  const candidateVersion = createdCandidate.version as number;

  let failure: unknown;
  let result:
    | {
        candidateRun: SystemsWorkflowProof;
        postRollbackRun: SystemsWorkflowProof;
        evidence: Record<string, unknown>;
      }
    | undefined;
  try {
    const evaluated = await postPromptGovernance(page, {
      operation: 'evaluate',
      candidateId,
    });
    expect(
      evaluated.status,
      `candidate evaluation failed: ${String(evaluated.body.code ?? 'unknown')}`,
    ).toBe(200);
    const evaluation = evaluated.body.evaluation as Record<string, unknown>;
    expect(evaluation).toMatchObject({
      passed: true,
      caseCount: 24,
      managerCount: 8,
      safetyPassed: true,
      evidencePassed: true,
      toolAuthorityPassed: true,
      schemaPassed: true,
      costPassed: true,
      latencyPassed: true,
    });

    const promotionKey = randomUUID();
    const promotion = await transitionSystemsPrompt(
      page,
      'promote',
      current.templateId,
      candidateVersion,
      current.activeVersion,
      promotionKey,
    );
    expect(promotion).toEqual({
      active_version: candidateVersion,
      previous_version: current.activeVersion,
      replayed: false,
    });
    const promoted = await readCurrentSystemsPrompt(page);
    expect(promoted).toMatchObject({
      templateId: current.templateId,
      activeVersion: candidateVersion,
      modelRoute: 'gpt-5.6-luna',
      schemaVersion: previous.schema_version,
      toolPolicyVersion: previous.tool_policy_version,
      schema: previous.json_schema,
      toolPolicy: previous.tool_policy,
    });

    const candidateRun = await proveSystemsWorkflow(
      page,
      'systems-weekly-quality-platform',
      'ai',
      candidateHardCapUsd,
      'gpt-5.6-luna',
      {
        id: candidateId,
        modelRoute: 'gpt-5.6-luna',
        schemaVersion: previous.schema_version,
        toolPolicyVersion: previous.tool_policy_version,
      },
    );
    expect(candidateRun.model).toBe('gpt-5.6-luna');
    const candidateCallBeforeRollback = await readGovernedAiCall(candidateRun.runId);
    expect(candidateCallBeforeRollback).toMatchObject({
      run_id: candidateRun.runId,
      prompt_version_id: candidateId,
      model_route: 'gpt-5.6-luna',
      schema_version: previous.schema_version,
      tool_policy_version: previous.tool_policy_version,
      search_calls: 0,
    });

    const rollbackKey = randomUUID();
    const rollback = await transitionSystemsPrompt(
      page,
      'rollback',
      current.templateId,
      current.activeVersion,
      candidateVersion,
      rollbackKey,
    );
    expect(rollback).toEqual({
      active_version: current.activeVersion,
      previous_version: candidateVersion,
      replayed: false,
    });
    const restored = await readCurrentSystemsPrompt(page);
    expect(restored).toMatchObject({
      templateId: current.templateId,
      activeVersion: current.activeVersion,
      modelRoute: current.modelRoute,
      schemaVersion: previous.schema_version,
      toolPolicyVersion: previous.tool_policy_version,
      schema: previous.json_schema,
      toolPolicy: previous.tool_policy,
    });

    const postRollbackRun = await proveSystemsWorkflow(
      page,
      'systems-weekly-quality-platform',
      'ai',
      rollbackHardCapUsd,
      current.modelRoute,
      {
        id: previous.id,
        modelRoute: current.modelRoute,
        schemaVersion: previous.schema_version,
        toolPolicyVersion: previous.tool_policy_version,
      },
    );
    const postRollbackCall = await readGovernedAiCall(postRollbackRun.runId);
    expect(postRollbackCall).toMatchObject({
      run_id: postRollbackRun.runId,
      prompt_version_id: previous.id,
      model_route: current.modelRoute,
      schema_version: previous.schema_version,
      tool_policy_version: previous.tool_policy_version,
      search_calls: 0,
    });
    expect(await readGovernedAiCall(candidateRun.runId)).toEqual(candidateCallBeforeRollback);

    const candidateCost = Number(candidateCallBeforeRollback.actual_cost);
    const rollbackCost = Number(postRollbackCall.actual_cost);
    const totalActualCostUsd = candidateCost + rollbackCost;
    expect(totalActualCostUsd).toBeLessThan(0.2);
    result = {
      candidateRun,
      postRollbackRun,
      evidence: {
        templateId: current.templateId,
        previousActiveVersion: current.activeVersion,
        previousPromptVersionId: previous.id,
        previousModelRoute: current.modelRoute,
        candidateId,
        candidateVersion,
        candidateModelRoute: 'gpt-5.6-luna',
        schemaVersion: previous.schema_version,
        toolPolicyVersion: previous.tool_policy_version,
        evaluation: {
          passed: evaluation.passed,
          caseCount: evaluation.caseCount,
          managerCount: evaluation.managerCount,
          safetyPassed: evaluation.safetyPassed,
          evidencePassed: evaluation.evidencePassed,
          toolAuthorityPassed: evaluation.toolAuthorityPassed,
          schemaPassed: evaluation.schemaPassed,
          costPassed: evaluation.costPassed,
          latencyPassed: evaluation.latencyPassed,
        },
        promotionIdempotencyKey: promotionKey,
        promotion: {
          previousVersion: current.activeVersion,
          activeVersion: candidateVersion,
          replayed: false,
        },
        candidateRun: {
          runId: candidateRun.runId,
          correlationId: candidateRun.correlationId,
          reportId: candidateRun.reportId,
          aiCallId: candidateCallBeforeRollback.id,
          promptVersionId: candidateCallBeforeRollback.prompt_version_id,
          model: candidateRun.model,
          modelRoute: candidateCallBeforeRollback.model_route,
          schemaVersion: candidateCallBeforeRollback.schema_version,
          toolPolicyVersion: candidateCallBeforeRollback.tool_policy_version,
          actualCostUsd: candidateCost,
          hardCapUsd: candidateHardCapUsd,
          searchCalls: candidateCallBeforeRollback.search_calls,
        },
        rollbackIdempotencyKey: rollbackKey,
        rollback: {
          previousVersion: candidateVersion,
          activeVersion: current.activeVersion,
          replayed: false,
        },
        postRollbackRun: {
          runId: postRollbackRun.runId,
          correlationId: postRollbackRun.correlationId,
          reportId: postRollbackRun.reportId,
          aiCallId: postRollbackCall.id,
          promptVersionId: postRollbackCall.prompt_version_id,
          model: postRollbackRun.model,
          modelRoute: postRollbackCall.model_route,
          schemaVersion: postRollbackCall.schema_version,
          toolPolicyVersion: postRollbackCall.tool_policy_version,
          actualCostUsd: rollbackCost,
          hardCapUsd: rollbackHardCapUsd,
          searchCalls: postRollbackCall.search_calls,
        },
        previousRunHistoryUnchanged: true,
        totalActualCostUsd,
      },
    };
  } catch (error) {
    failure = error;
  }

  let cleanupFailure: unknown;
  if (candidateVersion > current.activeVersion) {
    try {
      const active = await postPromptGovernance(page, { operation: 'get_current' });
      const activeVersion = active.body.activeVersion;
      if (active.status !== 200 || !Number.isSafeInteger(activeVersion)) {
        throw new Error('Prompt candidate cleanup could not read the active version.');
      }
      if (activeVersion === candidateVersion) {
        await transitionSystemsPrompt(
          page,
          'rollback',
          current.templateId,
          current.activeVersion,
          candidateVersion,
          randomUUID(),
        );
      } else if (activeVersion !== current.activeVersion) {
        throw new Error('Prompt candidate cleanup found an unexpected active version.');
      }
    } catch (error) {
      cleanupFailure = error;
    }
  }
  if (failure && cleanupFailure)
    throw new AggregateError(
      [failure, cleanupFailure],
      'Prompt governance acceptance and rollback cleanup failed.',
    );
  if (failure) throw failure;
  if (cleanupFailure) throw cleanupFailure;
  if (!result) throw new Error('Prompt governance acceptance produced no evidence.');
  return result;
}

if (process.env.LIVE_E2E_FIXTURE_MISMATCH_EXPECTED_COUNT !== undefined) {
  test('deliberate staging fixture mismatch emits redacted failure diagnostics', async ({
    page,
  }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'AI Operations' })).toBeVisible();
    const fixtureIds = (process.env.LIVE_E2E_FIXTURE_IDS ?? '')
      .split(',')
      .filter((id) => id.length > 0);
    const expectedCount = Number(process.env.LIVE_E2E_FIXTURE_MISMATCH_EXPECTED_COUNT);
    expect(Number.isSafeInteger(expectedCount)).toBe(true);
    expect(
      fixtureIds,
      'Deliberate mismatch probe: staging fixture count must differ from the intentionally incorrect expectation.',
    ).toHaveLength(expectedCount);
  });
}

test('staging proves AI-16 prompt promotion/rollback and AI-19 correlated workflows in one AAL2 journey @ai16-ai19-acceptance', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(30 * 60_000);
  await page.goto('/login');
  const candidateSha = process.env.LIVE_E2E_CANDIDATE_SHA;
  expect(candidateSha).toMatch(/^[a-f0-9]{40}$/i);
  const releaseResponse = await page.request.get(
    new URL('/api/release', env.LIVE_E2E_BASE_URL).href,
  );
  expect(releaseResponse.status()).toBe(200);
  expect(await releaseResponse.json()).toEqual({
    schemaVersion: 1,
    releaseSha: candidateSha?.toLowerCase(),
  });

  const unauthenticated = await page.evaluate(async () => {
    const result = await fetch('/api/workflows/launch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workflowCode: 'travel-on-demand-plan',
        managerCode: 'travel',
        hardCapUsd: 0.01,
        modelCeiling: 'gpt-5.6-terra',
        searchCeiling: 0,
        idempotencyKey: '00000000-0000-4000-8000-000000000007',
        request: {
          purpose: 'Unauthenticated failure-path check',
          constraints: 'No provider calls.',
        },
      }),
    });
    return { status: result.status, body: (await result.json()) as { code?: string } };
  });
  expect(unauthenticated).toMatchObject({ status: 401, body: { code: 'unauthorised' } });
  await expect(page.getByRole('heading', { name: 'AI Operations' })).toBeVisible();
  await expect(page.getByText(/Multi-factor authentication is required/)).toBeVisible();

  await signInWithFreshMfa(page);

  await page.goto('/automations');
  const ownedSchedule = page.locator('article[data-schedule-id]').first();
  await expect(ownedSchedule, 'a schedule must be visible to its signed-in owner').toBeVisible();
  const targetSchedule = await ownedSchedule.getAttribute('data-schedule-id');
  if (!targetSchedule || !/^[0-9a-f-]{36}$/i.test(targetSchedule))
    throw new Error('Owned schedule ID is missing or invalid.');
  const initialStatusLabel = await ownedSchedule.locator('div.label').textContent();
  if (!initialStatusLabel) throw new Error('Owned schedule status is missing.');
  const scheduleAction = liveAuthScheduleAction(initialStatusLabel);
  const initialStatusPattern = new RegExp(`^${scheduleAction.initialLabel} ·`);
  await expect(
    ownedSchedule.getByRole('button', { name: scheduleAction.buttonName }),
  ).toBeVisible();
  await expect(ownedSchedule.locator('div.label')).toHaveText(initialStatusPattern);
  const protectedContentReachedAt = Date.now();

  const fixtureKey = `ai14-live-e2e:${randomUUID()}`;
  const createdFixtureResponse = await postAgentRuntime(page, {
    operation: 'create_fixture',
    fixtureKey,
  });
  expect(createdFixtureResponse.status).toBe(201);
  const createdFixture = createdFixtureResponse.body as {
    fixtureKey: string;
    conversationId: string;
    ids: {
      messageId: string;
      handoffId: string;
      attentionId: string;
      actionId: string;
      evidenceReferenceId: string;
    };
  };
  expect(createdFixture.fixtureKey).toBe(fixtureKey);
  expect(createdFixture.conversationId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(createdFixture.ids.handoffId).toMatch(/^[0-9a-f-]{36}$/i);

  const contractRead = await postAgentRuntime(page, {
    operation: 'read_fixture',
    conversationId: createdFixture.conversationId,
  });
  expect(contractRead.status).toBe(200);
  const contractGraph = contractRead.body as {
    conversation: { id: string; currentManagerCode: string; metadata: Record<string, unknown> };
    messages: Array<{ id: string; authority: string }>;
    handoffs: Array<{ id: string; status: string }>;
    attentionItems: Array<{ id: string; status: string }>;
    actions: Array<{ id: string; status: string; approval_state: string }>;
    evidenceReferences: Array<{ id: string; source_type: string }>;
    evidenceLinks: Array<{ entity_id: string; entity_type: string }>;
  };
  expect(contractGraph.conversation).toMatchObject({
    id: createdFixture.conversationId,
    currentManagerCode: 'systems',
    metadata: { fixture: 'ai14-live-e2e', fixtureKey },
  });
  expect(contractGraph.messages).toContainEqual(
    expect.objectContaining({ id: createdFixture.ids.messageId, authority: 'system_generated' }),
  );
  expect(contractGraph.handoffs).toContainEqual(
    expect.objectContaining({ id: createdFixture.ids.handoffId, status: 'requested' }),
  );
  expect(contractGraph.attentionItems).toContainEqual(
    expect.objectContaining({ id: createdFixture.ids.attentionId, status: 'new' }),
  );
  expect(contractGraph.actions).toContainEqual(
    expect.objectContaining({
      id: createdFixture.ids.actionId,
      status: 'proposed',
      approval_state: 'not_required',
    }),
  );
  expect(contractGraph.evidenceReferences).toContainEqual(
    expect.objectContaining({
      id: createdFixture.ids.evidenceReferenceId,
      source_type: 'legacy_reference',
    }),
  );
  expect(contractGraph.evidenceLinks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        entity_id: createdFixture.conversationId,
        entity_type: 'conversation',
      }),
      expect.objectContaining({
        entity_id: createdFixture.ids.handoffId,
        entity_type: 'conversation_handoff',
      }),
      expect.objectContaining({ entity_id: createdFixture.ids.actionId, entity_type: 'action' }),
    ]),
  );

  const acceptedHandoff = await postAgentRuntime(page, {
    operation: 'transition_handoff',
    handoffId: createdFixture.ids.handoffId,
    status: 'accepted',
  });
  expect(acceptedHandoff.status).toBe(200);
  expect(acceptedHandoff.body).toMatchObject({
    id: createdFixture.ids.handoffId,
    status: 'accepted',
  });
  const invalidHandoffTransition = await postAgentRuntime(page, {
    operation: 'transition_handoff',
    handoffId: createdFixture.ids.handoffId,
    status: 'requested',
  });
  expect(invalidHandoffTransition).toMatchObject({
    status: 409,
    body: { code: 'invalid_transition' },
  });

  const persistedGraph = await Promise.all([
    serviceRows<{ id: string; current_manager_code: string; status: string }>(
      'conversations',
      `select=id,current_manager_code,status&id=eq.${createdFixture.conversationId}`,
    ),
    serviceRows<{ id: string; authority: string }>(
      'conversation_messages',
      `select=id,authority&id=eq.${createdFixture.ids.messageId}`,
    ),
    serviceRows<{ id: string; status: string; accepted_at: string | null }>(
      'conversation_handoffs',
      `select=id,status,accepted_at&id=eq.${createdFixture.ids.handoffId}`,
    ),
    serviceRows<{ status: string }>(
      'conversation_handoff_events',
      `select=status&handoff_id=eq.${createdFixture.ids.handoffId}&order=created_at.asc`,
    ),
    serviceRows<{ id: string; status: string }>(
      'attention_items',
      `select=id,status&id=eq.${createdFixture.ids.attentionId}`,
    ),
    serviceRows<{ id: string; status: string; approval_state: string }>(
      'actions',
      `select=id,status,approval_state&id=eq.${createdFixture.ids.actionId}`,
    ),
    serviceRows<{ id: string; source_type: string }>(
      'evidence_references',
      `select=id,source_type&id=eq.${createdFixture.ids.evidenceReferenceId}`,
    ),
    serviceRows<{ entity_id: string; entity_type: string }>(
      'evidence_links',
      `select=entity_id,entity_type&evidence_reference_id=eq.${createdFixture.ids.evidenceReferenceId}`,
    ),
  ]);
  expect(persistedGraph[0][0]).toMatchObject({
    id: createdFixture.conversationId,
    current_manager_code: 'personal',
    status: 'open',
  });
  expect(persistedGraph[1][0]).toMatchObject({
    id: createdFixture.ids.messageId,
    authority: 'system_generated',
  });
  expect(persistedGraph[2][0]?.status).toBe('accepted');
  expect(persistedGraph[2][0]?.accepted_at).toBeTruthy();
  expect(persistedGraph[3].map(({ status }) => status)).toEqual(['requested', 'accepted']);
  expect(persistedGraph[4][0]?.status).toBe('new');
  expect(persistedGraph[5][0]).toMatchObject({
    status: 'proposed',
    approval_state: 'not_required',
  });
  expect(persistedGraph[6][0]?.source_type).toBe('legacy_reference');
  expect(persistedGraph[7]).toHaveLength(5);

  const acceptedContractRead = await postAgentRuntime(page, {
    operation: 'read_fixture',
    conversationId: createdFixture.conversationId,
  });
  expect(acceptedContractRead.status).toBe(200);
  expect(
    (acceptedContractRead.body as { conversation: { currentManagerCode: string } }).conversation
      .currentManagerCode,
  ).toBe('personal');
  expect(
    (acceptedContractRead.body as { handoffs: Array<{ status: string }> }).handoffs[0]?.status,
  ).toBe('accepted');

  const aal2Probe = await page.evaluate(async () => {
    const response = await fetch('/api/auth/mfa/aal2-probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    return {
      httpStatus: response.status,
      body: (await response.json()) as { probeId?: string; status?: number; code?: string },
    };
  });
  expect(aal2Probe.httpStatus).toBe(200);
  expect(aal2Probe.body).toMatchObject({ status: 400, code: 'invalid_plan' });
  expect(aal2Probe.body.probeId).toMatch(/^[0-9a-f-]{36}$/i);

  const fixtureIds = (process.env.LIVE_E2E_FIXTURE_IDS ?? '')
    .split(',')
    .filter((id) => id.length > 0);
  for (const runId of fixtureIds) {
    expect(runId).toMatch(/^[0-9a-f-]{36}$/i);
    const cancellation = await page.evaluate(async (id) => {
      const response = await fetch('/api/workflows/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ runId: id }),
      });
      return { status: response.status, body: (await response.json()) as { cancelled?: boolean } };
    }, runId);
    expect(cancellation).toMatchObject({ status: 200, body: { cancelled: true } });
    const rows = await serviceRows<{ status: string; cancelled_at: string | null }>(
      'workflow_runs',
      `select=status,cancelled_at&id=eq.${runId}`,
    );
    expect(rows[0]).toMatchObject({ status: 'cancelled' });
    expect(rows[0]?.cancelled_at).toBeTruthy();
  }

  const deterministicProof = await proveSystemsWorkflow(
    page,
    'systems-daily-cost-capacity',
    'deterministic',
    0.01,
  );
  const governanceProof = await proveAi16PromptGovernance(page);
  const responsesProof = governanceProof.candidateRun;
  const rollbackProof = governanceProof.postRollbackRun;
  expect(deterministicProof.aiCallCount).toBe(0);
  expect(responsesProof.aiCallCount).toBe(1);
  expect(responsesProof.model).toBe('gpt-5.6-luna');
  expect(rollbackProof.aiCallCount).toBe(1);
  expect(
    deterministicProof.searchCalls + responsesProof.searchCalls + rollbackProof.searchCalls,
  ).toBe(0);
  expect(
    deterministicProof.actualCostUsd + responsesProof.actualCostUsd + rollbackProof.actualCostUsd,
  ).toBeLessThan(2);

  await page.goto('/ai-traces-audit');
  await expect(page.getByRole('heading', { name: 'AI Traces & Audit' })).toBeVisible();
  for (const proof of [deterministicProof, responsesProof, rollbackProof]) {
    const correlatedTrace = page
      .getByRole('region', { name: 'Workflow traces' })
      .locator('article')
      .filter({ hasText: proof.correlationId });
    await expect(
      correlatedTrace.getByRole('heading', { name: 'on_demand_run_queued' }),
    ).toBeVisible();
  }

  const staleAfter = protectedContentReachedAt + 5 * 60_000 + 2_000;
  const waitMs = staleAfter - Date.now();
  process.stdout.write(
    `Waiting ${Math.ceil(Math.max(0, waitMs) / 1000)}s after authenticated schedule content for the spec-defined five-minute MFA freshness window to expire.\n`,
  );
  if (waitMs > 0) await page.waitForTimeout(waitMs);
  expect(Date.now() - protectedContentReachedAt).toBeGreaterThan(5 * 60_000);

  await page.goto('/automations');
  const scheduleCard = page.locator(`[data-schedule-id="${targetSchedule}"]`);
  await expect(scheduleCard).toBeVisible();
  const staleAttempt = await page.evaluate(
    async (body) => {
      const response = await fetch('/api/schedules/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return {
        status: response.status,
        usedMfaGate: Object.prototype.hasOwnProperty.call(body, 'mfaGateId'),
        body: (await response.json()) as { code?: string },
      };
    },
    { scheduleId: targetSchedule, enabled: scheduleAction.initialEnabled },
  );
  expect(staleAttempt).toMatchObject({ status: 403, body: { code: 'fresh_mfa_required' } });
  expect(staleAttempt.usedMfaGate).toBe(false);
  await expect(scheduleCard.locator('div.label')).toHaveText(initialStatusPattern);
  await expect(scheduleCard.getByLabel('Six-digit code')).toHaveCount(0);
  await expect(
    scheduleCard.getByText('Fresh MFA is required before changing this schedule.'),
  ).toHaveCount(0);

  const freshMfaProbe = await page.evaluate(async () => {
    const response = await fetch('/api/auth/mfa/aal2-probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    return {
      status: response.status,
      body: (await response.json()) as { probeId?: string; status?: number; code?: string },
    };
  });
  expect(freshMfaProbe.status).toBe(200);
  expect(freshMfaProbe.body).toMatchObject({ status: 400, code: 'invalid_plan' });
  expect(freshMfaProbe.body.probeId).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9:-]{0,127}$/);

  await page.goto('/mfa?job=schedule_update&returnTo=%2Foverview');
  await expect(page.getByRole('heading', { name: 'Verify your identity' })).toBeVisible();
  await expect(page.getByLabel('Six-digit code')).toBeVisible();
  process.stdout.write(
    '\nComplete the fresh Microsoft Authenticator challenge in this same browser journey.\n',
  );
  await expect(page).toHaveURL(/\/overview(?:\?|$)/, { timeout: 5 * 60_000 });
  const gate = await page.evaluate(() => {
    const raw = localStorage.getItem('mfa_job_gate') ?? sessionStorage.getItem('mfa_job_gate');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { job?: string; id?: string };
    return { job: parsed.job, id: parsed.id };
  });
  expect(gate).toMatchObject({ job: 'schedule_update' });
  if (gate?.job !== 'schedule_update' || !gate.id)
    throw new Error('Fresh TOTP did not store the schedule update gate.');
  expect(gate.id).toMatch(/^[0-9a-f-]{36}$/i);
  const freshAttempt = await page.evaluate(
    async (body) => {
      const response = await fetch('/api/schedules/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return {
        status: response.status,
        body: (await response.json()) as { schedule?: { enabled?: boolean }; code?: string },
      };
    },
    { scheduleId: targetSchedule, enabled: scheduleAction.initialEnabled, mfaGateId: gate.id },
  );
  expect(freshAttempt.status).toBe(200);
  expect(freshAttempt.body).toMatchObject({
    schedule: { enabled: scheduleAction.initialEnabled },
  });
  await page.goto('/automations');
  await expect(scheduleCard.locator('div.label')).toHaveText(initialStatusPattern);

  let webkitProbeId: string | null = null;
  const webkitBrowser = await webkit.launch({ headless: true });
  try {
    const webkitContext = await webkitBrowser.newContext({
      storageState: await page.context().storageState(),
    });
    const webkitPage = await webkitContext.newPage();
    await webkitPage.goto('/overview');
    await expect(webkitPage.getByRole('heading', { name: /Overview/ })).toBeVisible();
    const webkitProbe = await webkitPage.evaluate(async () => {
      const response = await fetch('/api/auth/mfa/aal2-probe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      return {
        httpStatus: response.status,
        body: (await response.json()) as { probeId?: string; status?: number; code?: string },
      };
    });
    expect(webkitProbe.httpStatus).toBe(200);
    expect(webkitProbe.body).toMatchObject({ status: 400, code: 'invalid_plan' });
    if (!webkitProbe.body.probeId)
      throw new Error('WebKit AAL2 probe did not return its correlation ID.');
    webkitProbeId = webkitProbe.body.probeId;
    await webkitContext.close();
  } finally {
    await webkitBrowser.close();
  }

  const acceptanceOutputPath = process.env.LIVE_E2E_ACCEPTANCE_OUTPUT_PATH;
  if (acceptanceOutputPath) {
    if (!webkitProbeId)
      throw new Error('Hosted acceptance evidence requires the passing WebKit probe result.');
    const candidateSha = process.env.LIVE_E2E_CANDIDATE_SHA;
    const candidateTreeSha = process.env.LIVE_E2E_CANDIDATE_TREE_SHA;
    const pullRequestNumber = process.env.LIVE_E2E_PULL_REQUEST_NUMBER;
    const deploymentRunId = process.env.LIVE_E2E_DEPLOYMENT_RUN_ID;
    if (!candidateSha || !candidateTreeSha || !pullRequestNumber || !deploymentRunId)
      throw new Error(
        'Hosted acceptance output requires candidate SHA, tree SHA, PR number, and deployment run ID.',
      );
    await writeLiveStagingAcceptanceEvidence(acceptanceOutputPath, {
      candidateSha,
      candidateTreeSha,
      pullRequestNumber: Number(pullRequestNumber),
      deploymentRunId,
      stagingOrigin: env.LIVE_E2E_BASE_URL,
      acceptanceProfile: 'auth-browser',
      completeSuite: 'passed',
      manualMfaChallengeObserved,
      browserChecks: { chromium: 'passed', webkit: 'passed' },
      checks: {
        authAal2: 'passed',
        safeRead: 'passed',
        safeWrite: 'passed',
        ui: 'passed',
        edgeFunctions: 'passed',
        releaseVersion: 'passed',
      },
      correlationIds: [
        deterministicProof.runId,
        deterministicProof.correlationId,
        deterministicProof.reportId,
        responsesProof.runId,
        responsesProof.correlationId,
        responsesProof.reportId,
        rollbackProof.runId,
        rollbackProof.correlationId,
        rollbackProof.reportId,
        aal2Probe.body.probeId!,
        freshMfaProbe.body.probeId!,
        webkitProbeId,
      ],
      workflowRuns: [deterministicProof, responsesProof],
      promptGovernanceProof: governanceProof.evidence,
      freshMfaAction: {
        staleDenied: 'passed',
        staleAttemptUsedMfaGate: false,
        freshReauthAccepted: 'passed',
      },
      acceptedAt: new Date().toISOString(),
    });
  }
});
