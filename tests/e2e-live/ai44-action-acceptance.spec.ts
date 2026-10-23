import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { test, expect } from '@playwright/test';
import { parseLiveE2eEnvironment, stagingTarget } from '../../apps/web/lib/live-e2e-safety';
import { resolveGitTreeSha } from '../../infrastructure/scripts/live-acceptance-evidence.js';
import { Ai44ActionProofSchema } from '../../infrastructure/scripts/release-gate.js';

const env = parseLiveE2eEnvironment(process.env, 'auth-acceptance');
const fixtureKey = process.env.LIVE_E2E_AI44_FIXTURE_KEY;
const candidateSha = process.env.LIVE_E2E_CANDIDATE_SHA;
const candidateTreeSha = process.env.LIVE_E2E_CANDIDATE_TREE_SHA;
const pullRequestNumber = Number(process.env.LIVE_E2E_PULL_REQUEST_NUMBER);
const deploymentRunId = process.env.LIVE_E2E_DEPLOYMENT_RUN_ID;
const acceptanceOutputPath = process.env.LIVE_E2E_AI44_ACCEPTANCE_OUTPUT_PATH;
const templateId = '3cf2b003-41b9-4d77-a865-c00c8e335b7e';
const fixtureKeySchema = /^ai44-live-e2e:[0-9]{8}:[0-9a-f-]{36}$/i;

type ExecutionRequest = {
  id: string;
  user_id: string;
  action_id: string;
  conversation_id: string;
  source_message_id: string;
  authority: string;
  status: string;
  command_type: string;
  execution_mode: string;
  idempotency_key: string;
  channel: string;
  correlation_id: string;
  attempt_count: number;
  request_fingerprint: string | null;
  policy_decision: { decision?: string; reason?: string } | null;
  typed_parameters: { templateId?: string; targetVersion?: number };
};

type Action = {
  id: string;
  status: string;
  authority: string;
  approval_state: string;
  action_type: string;
};

type PromptTemplate = { id: string; active_version: number; code: string };
type PromptVersion = {
  evaluation_status: string;
  evaluation_result: Record<string, unknown>;
};
type Receipt = {
  id: string;
  execution_request_id: string;
  user_id: string;
  action_id: string;
  kind: string;
  correlation_id: string;
  idempotency_key: string;
  result: {
    id: string;
    kind: string;
    actionId: string;
    executionRequestId: string;
    resultReference: string;
    reversalToken: string | null;
    reversesReceiptId: string | null;
  };
};

type CanonicalActionExecutionContext = {
  request: {
    id: string;
    userId: string;
    actionId: string;
    actionType: string;
    approvalState: string;
  };
  freshWebAal2: boolean;
};

type PromptTransitionReplay = {
  active_version: number;
  previous_version: number;
  replayed: boolean;
};

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name}_missing`);
  return value;
}

function currentTimestamp(): string {
  return new Date().toISOString();
}

function transitionKey(
  userId: string,
  executionRequestId: string,
  idempotencyKey: string,
  operation: 'promote' | 'rollback',
): string {
  const digest = createHash('sha256')
    .update(`${userId}:${executionRequestId}:${idempotencyKey}:${operation}`)
    .digest('hex');
  return `ai44:${operation}:${digest}`;
}

async function stagingRows<T extends object>(
  table: string,
  parameters: Record<string, string>,
  bearerToken = env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY,
): Promise<T[]> {
  const url = new URL(`/rest/v1/${table}`, env.LIVE_E2E_SUPABASE_URL);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: {
      apikey: env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${bearerToken}`,
    },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`ai44_staging_${table}_lookup_failed_${response.status}`);
  return (await response.json()) as T[];
}

async function stagingRpc<T>(
  functionName: string,
  parameters: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(new URL(`/rest/v1/rpc/${functionName}`, env.LIVE_E2E_SUPABASE_URL), {
    method: 'POST',
    headers: {
      apikey: env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(parameters),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`ai44_staging_${functionName}_rpc_failed_${response.status}`);
  return (await response.json()) as T;
}

function loadCanonicalActionContext(
  executionRequestId: string,
): Promise<CanonicalActionExecutionContext> {
  return stagingRpc('load_canonical_action_execution_request', {
    p_execution_request_id: executionRequestId,
  });
}

function replayPromptTransition(input: {
  templateId: string;
  targetVersion: number;
  expectedActiveVersion: number;
  actorUserId: string;
  operation: 'promote' | 'rollback';
  idempotencyKey: string;
}): Promise<PromptTransitionReplay> {
  return stagingRpc('transition_prompt_version', {
    p_template_id: input.templateId,
    p_target_version: input.targetVersion,
    p_expected_active_version: input.expectedActiveVersion,
    p_actor_user_id: input.actorUserId,
    p_operation: input.operation,
    p_idempotency_key: input.idempotencyKey,
  });
}

async function invokeProductionDispatcher(executionRequestId: string): Promise<unknown> {
  const response = await fetch(`${stagingTarget.supabaseUrl}/functions/v1/ai-execute`, {
    method: 'POST',
    headers: {
      apikey: env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ executionRequestId }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`ai44_production_dispatch_failed_${response.status}`);
  return (await response.json()) as unknown;
}

async function requireSingleRow<T extends object>(
  table: string,
  parameters: Record<string, string>,
): Promise<T> {
  const rows = await stagingRows<T>(table, parameters);
  if (rows.length !== 1) throw new Error(`ai44_staging_${table}_row_count_${rows.length}`);
  return rows[0]!;
}

async function requireSingleOwnerRow<T extends object>(
  table: string,
  parameters: Record<string, string>,
  accessToken: string,
): Promise<T> {
  const rows = await stagingRows<T>(table, parameters, accessToken);
  if (rows.length !== 1) throw new Error(`ai44_staging_${table}_owner_row_count_${rows.length}`);
  return rows[0]!;
}

function readAal2AccessToken(
  cookies: Array<{ name: string; value: string }>,
  expectedUserId: string,
): string {
  const cookieBase = `sb-${stagingTarget.projectRef}-auth-token`;
  const chunks = cookies
    .filter(({ name }) => name === cookieBase || name.startsWith(`${cookieBase}.`))
    .sort((left, right) => {
      const leftIndex = Number(left.name.slice(cookieBase.length + 1)) || 0;
      const rightIndex = Number(right.name.slice(cookieBase.length + 1)) || 0;
      return leftIndex - rightIndex;
    });
  if (chunks.length === 0) throw new Error('ai44_browser_auth_cookie_missing');
  const encoded = chunks.map(({ value }) => value).join('');
  const json = encoded.startsWith('base64-')
    ? Buffer.from(encoded.slice('base64-'.length), 'base64url').toString('utf8')
    : decodeURIComponent(encoded);
  const session = JSON.parse(json) as { access_token?: string };
  const token = session.access_token;
  if (!token) throw new Error('ai44_browser_access_token_missing');
  const claimsPart = token.split('.')[1];
  if (!claimsPart) throw new Error('ai44_browser_access_token_invalid');
  const claims = JSON.parse(Buffer.from(claimsPart, 'base64url').toString('utf8')) as {
    aal?: string;
    exp?: number;
    sub?: string;
  };
  if (claims.aal !== 'aal2' || claims.sub !== expectedUserId) {
    throw new Error('ai44_browser_session_identity_or_aal_invalid');
  }
  if (typeof claims.exp !== 'number' || claims.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('ai44_browser_session_expired');
  }
  return token;
}

async function requestCanonicalReversal(
  page: import('@playwright/test').Page,
  userId: string,
  receiptId: string,
  idempotencyKey: string,
): Promise<{ executionRequestId: string; replayed: boolean }> {
  const cookies = await page.context().cookies(stagingTarget.origin);
  const accessToken = readAal2AccessToken(cookies, userId);
  const response = await fetch(
    `${stagingTarget.supabaseUrl}/rest/v1/rpc/request_canonical_action_reversal`,
    {
      method: 'POST',
      headers: {
        apikey: env.LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_original_receipt_id: receiptId, p_idempotency_key: idempotencyKey }),
      cache: 'no-store',
    },
  );
  if (!response.ok) throw new Error(`ai44_canonical_reversal_request_failed_${response.status}`);
  return (await response.json()) as { executionRequestId: string; replayed: boolean };
}

test('AI-44 staging proves fresh-MFA canonical action, one effect, receipt replay and reversal', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(18 * 60_000);
  if (process.env.LIVE_E2E_MANUAL_MFA !== 'true') {
    throw new Error('ai44_acceptance_requires_visible_manual_mfa');
  }
  expect(fixtureKey).toMatch(fixtureKeySchema);
  expect(candidateSha).toMatch(/^[a-f0-9]{40}$/i);
  expect(candidateTreeSha).toMatch(/^[a-f0-9]{40}$/i);
  expect(pullRequestNumber).toBeGreaterThan(0);
  expect(deploymentRunId).toMatch(/^[1-9][0-9]{0,19}$/);
  expect(resolveGitTreeSha(candidateSha!)).toBe(candidateTreeSha);
  required(acceptanceOutputPath, 'LIVE_E2E_AI44_ACCEPTANCE_OUTPUT_PATH');

  const users = await stagingRows<{ id: string }>('app_users', {
    select: 'id',
    is_allowed: 'eq.true',
  });
  expect(users).toHaveLength(1);
  const request = await requireSingleRow<ExecutionRequest>('execution_requests', {
    select:
      'id,user_id,action_id,conversation_id,source_message_id,authority,status,command_type,execution_mode,idempotency_key,channel,correlation_id,attempt_count,request_fingerprint,policy_decision,typed_parameters',
    idempotency_key: `eq.${fixtureKey}:execute`,
  });
  expect(request.user_id).toBe(users[0]!.id);
  expect(request).toMatchObject({
    authority: 'verified_user',
    status: 'queued',
    command_type: 'review_prompt_promotion',
    execution_mode: 'execute',
    channel: 'web_chat',
    idempotency_key: `${fixtureKey}:execute`,
    attempt_count: 0,
    request_fingerprint: null,
    policy_decision: null,
    typed_parameters: { templateId, targetVersion: 3 },
  });
  const queuedActionContext = await loadCanonicalActionContext(request.id);
  expect(queuedActionContext.request).toMatchObject({
    id: request.id,
    userId: request.user_id,
    actionId: request.action_id,
    actionType: 'review_prompt_promotion',
    approvalState: 'not_required',
  });
  const template = await requireSingleRow<PromptTemplate>('prompt_templates', {
    select: 'id,active_version,code',
    id: `eq.${templateId}`,
  });
  expect(template).toMatchObject({
    id: templateId,
    active_version: 2,
    code: 'controlled-agent-report',
  });
  const targetVersion = await requireSingleRow<PromptVersion>('prompt_versions', {
    select: 'evaluation_status,evaluation_result',
    template_id: `eq.${templateId}`,
    version: 'eq.3',
  });
  expect(targetVersion.evaluation_status).toBe('promoted');
  expect(targetVersion.evaluation_result).toMatchObject({
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
  expect(
    await stagingRows('execution_receipts', {
      select: 'id',
      idempotency_key: `eq.${fixtureKey}:execute`,
    }),
  ).toHaveLength(0);

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
      // Only a real navigation to staging MFA satisfies this requirement.
    }
  });
  let actionContext = await loadCanonicalActionContext(request.id);
  if (actionContext.freshWebAal2) {
    process.stdout.write(
      'Waiting for the canonical staging action context to report that the previous MFA event is stale.\n',
    );
    const staleDeadline = Date.now() + 6 * 60_000;
    while (actionContext.freshWebAal2) {
      if (Date.now() >= staleDeadline) throw new Error('ai44_previous_mfa_did_not_expire');
      await page.waitForTimeout(5_000);
      actionContext = await loadCanonicalActionContext(request.id);
    }
  }
  expect(actionContext.freshWebAal2).toBe(false);

  const forwardIdempotencyKey = request.idempotency_key;
  const forwardTransitionKey = transitionKey(
    request.user_id,
    request.id,
    forwardIdempotencyKey,
    'promote',
  );
  const staleResult = await invokeProductionDispatcher(request.id);
  expect(staleResult).toMatchObject({
    kind: 'policy_stopped',
    decision: { decision: 'reauth_required', reason: 'web_action_requires_fresh_aal2' },
  });
  const staleRequest = await requireSingleRow<ExecutionRequest>('execution_requests', {
    select:
      'id,user_id,action_id,conversation_id,source_message_id,authority,status,command_type,execution_mode,idempotency_key,channel,correlation_id,attempt_count,request_fingerprint,policy_decision,typed_parameters',
    id: `eq.${request.id}`,
  });
  expect(staleRequest).toMatchObject({
    status: 'queued',
    attempt_count: 0,
    policy_decision: { decision: 'reauth_required', reason: 'web_action_requires_fresh_aal2' },
  });
  expect(
    await stagingRows('execution_receipts', {
      select: 'id',
      idempotency_key: `eq.${forwardIdempotencyKey}`,
    }),
  ).toHaveLength(0);
  expect(
    (
      await requireSingleRow<PromptTemplate>('prompt_templates', {
        select: 'id,active_version,code',
        id: `eq.${templateId}`,
      })
    ).active_version,
  ).toBe(2);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'AI Operations' })).toBeVisible();
  if (env.LIVE_E2E_EMAIL && env.LIVE_E2E_PASSWORD) {
    await page.getByLabel('Email').fill(env.LIVE_E2E_EMAIL);
    await page.getByLabel('Password').fill(env.LIVE_E2E_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
  }
  process.stdout.write(
    '\nSign in to the allowlisted staging account and complete the real Microsoft Authenticator challenge in this headed browser.\n',
  );
  await expect(page).toHaveURL(/\/overview(?:\?|$)/, { timeout: 5 * 60_000 });
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  expect(manualMfaChallengeObserved).toBe(true);
  actionContext = await loadCanonicalActionContext(request.id);
  expect(actionContext.freshWebAal2).toBe(true);
  const actionToken = readAal2AccessToken(
    await page.context().cookies(stagingTarget.origin),
    request.user_id,
  );
  const action = await requireSingleOwnerRow<Action>(
    'actions',
    {
      select: 'id,status,authority,approval_state,action_type',
      id: `eq.${request.action_id}`,
      user_id: `eq.${request.user_id}`,
    },
    actionToken,
  );
  expect(action).toMatchObject({
    id: request.action_id,
    status: 'proposed',
    authority: 'verified_user',
    approval_state: 'not_required',
    action_type: 'review_prompt_promotion',
  });

  const completed = (await invokeProductionDispatcher(request.id)) as {
    kind?: string;
    receipt?: Receipt['result'];
  };
  expect(completed.kind).toBe('completed');
  expect(completed.receipt).toMatchObject({
    userId: request.user_id,
    executionRequestId: request.id,
    actionId: action.id,
    actionType: 'review_prompt_promotion',
    kind: 'succeeded',
    policyDecision: 'allow',
    policyReason: 'verified_user_authority',
    resultReference: `prompt-template:${templateId}:version:3`,
    reversalToken: '3:2',
  });
  const originalReceiptId = required(completed.receipt?.id, 'ai44_original_receipt_id');
  const forwardReceipts = await stagingRows<Receipt>('execution_receipts', {
    select: 'id,execution_request_id,user_id,action_id,kind,correlation_id,idempotency_key,result',
    idempotency_key: `eq.${forwardIdempotencyKey}`,
  });
  expect(forwardReceipts).toHaveLength(1);
  expect(forwardReceipts[0]).toMatchObject({
    id: originalReceiptId,
    execution_request_id: request.id,
    user_id: request.user_id,
    action_id: action.id,
    kind: 'succeeded',
  });
  const terminalRequest = await requireSingleRow<ExecutionRequest>('execution_requests', {
    select:
      'id,user_id,action_id,conversation_id,source_message_id,authority,status,command_type,execution_mode,idempotency_key,channel,correlation_id,attempt_count,request_fingerprint,policy_decision,typed_parameters',
    id: `eq.${request.id}`,
  });
  expect(terminalRequest).toMatchObject({
    status: 'succeeded',
    attempt_count: 1,
    policy_decision: { decision: 'allow', reason: 'verified_user_authority' },
  });
  const forwardEffect = await replayPromptTransition({
    templateId,
    targetVersion: 3,
    expectedActiveVersion: 2,
    actorUserId: request.user_id,
    operation: 'promote',
    idempotencyKey: forwardTransitionKey,
  });
  expect(forwardEffect).toEqual({
    active_version: 3,
    previous_version: 2,
    replayed: true,
  });
  expect(
    (
      await requireSingleRow<PromptTemplate>('prompt_templates', {
        select: 'id,active_version,code',
        id: `eq.${templateId}`,
      })
    ).active_version,
  ).toBe(3);

  const replay = (await invokeProductionDispatcher(request.id)) as {
    kind?: string;
    receipt?: Receipt['result'];
  };
  expect(replay).toMatchObject({ kind: 'replay', receipt: completed.receipt });
  expect(
    await stagingRows('execution_receipts', {
      select: 'id',
      idempotency_key: `eq.${forwardIdempotencyKey}`,
    }),
  ).toHaveLength(1);
  expect(
    await replayPromptTransition({
      templateId,
      targetVersion: 3,
      expectedActiveVersion: 2,
      actorUserId: request.user_id,
      operation: 'promote',
      idempotencyKey: forwardTransitionKey,
    }),
  ).toEqual({ active_version: 3, previous_version: 2, replayed: true });

  const reversalIdempotencyKey = `${fixtureKey}:reverse`;
  const reversalRequest = await requestCanonicalReversal(
    page,
    request.user_id,
    originalReceiptId,
    reversalIdempotencyKey,
  );
  expect(reversalRequest.replayed).toBe(false);
  expect(reversalRequest.executionRequestId).toMatch(/^[0-9a-f-]{36}$/i);
  const reversalExecution = await requireSingleRow<ExecutionRequest>('execution_requests', {
    select:
      'id,user_id,action_id,conversation_id,source_message_id,authority,status,command_type,execution_mode,idempotency_key,channel,correlation_id,attempt_count,request_fingerprint,policy_decision,typed_parameters',
    id: `eq.${reversalRequest.executionRequestId}`,
  });
  const reversalResult = (await invokeProductionDispatcher(reversalRequest.executionRequestId)) as {
    kind?: string;
    receipt?: Receipt['result'];
  };
  expect(reversalResult.kind).toBe('completed');
  expect(reversalResult.receipt).toMatchObject({
    executionRequestId: reversalRequest.executionRequestId,
    actionId: action.id,
    actionType: 'review_prompt_promotion',
    kind: 'reversed',
    reversesReceiptId: originalReceiptId,
    resultReference: `prompt-template:${templateId}:version:2`,
  });
  const reversalReceiptId = required(reversalResult.receipt?.id, 'ai44_reversal_receipt_id');
  const reversalTransitionKey = transitionKey(
    request.user_id,
    reversalRequest.executionRequestId,
    reversalIdempotencyKey,
    'rollback',
  );
  const reversalReceipts = await stagingRows<Receipt>('execution_receipts', {
    select: 'id,execution_request_id,user_id,action_id,kind,correlation_id,idempotency_key,result',
    idempotency_key: `eq.${reversalIdempotencyKey}`,
  });
  expect(reversalReceipts).toHaveLength(1);
  expect(reversalReceipts[0]!.id).toBe(reversalReceiptId);
  const reversalEffect = await replayPromptTransition({
    templateId,
    targetVersion: 2,
    expectedActiveVersion: 3,
    actorUserId: request.user_id,
    operation: 'rollback',
    idempotencyKey: reversalTransitionKey,
  });
  expect(reversalEffect).toEqual({
    active_version: 2,
    previous_version: 3,
    replayed: true,
  });
  expect(reversalExecution.user_id).toBe(request.user_id);
  expect(
    (
      await requireSingleRow<PromptTemplate>('prompt_templates', {
        select: 'id,active_version,code',
        id: `eq.${templateId}`,
      })
    ).active_version,
  ).toBe(2);

  const reversalReplay = (await invokeProductionDispatcher(reversalRequest.executionRequestId)) as {
    kind?: string;
    receipt?: Receipt['result'];
  };
  expect(reversalReplay).toMatchObject({ kind: 'replay', receipt: reversalResult.receipt });
  expect(
    await stagingRows('execution_receipts', {
      select: 'id',
      idempotency_key: `eq.${reversalIdempotencyKey}`,
    }),
  ).toHaveLength(1);
  expect(
    await replayPromptTransition({
      templateId,
      targetVersion: 2,
      expectedActiveVersion: 3,
      actorUserId: request.user_id,
      operation: 'rollback',
      idempotencyKey: reversalTransitionKey,
    }),
  ).toEqual({ active_version: 2, previous_version: 3, replayed: true });
  expect(
    (
      await requireSingleOwnerRow<Action>(
        'actions',
        {
          select: 'id,status,authority,approval_state,action_type',
          id: `eq.${action.id}`,
          user_id: `eq.${request.user_id}`,
        },
        actionToken,
      )
    ).status,
  ).toBe('reversed');

  const evidenceCommon = {
    schemaVersion: 1 as const,
    candidateSha: candidateSha!.toLowerCase(),
    candidateTreeSha: candidateTreeSha!.toLowerCase(),
    pullRequestNumber,
    deploymentRunId: deploymentRunId!,
    stagingOrigin: stagingTarget.origin,
    acceptedAt: currentTimestamp(),
  };
  const actionEvidence = Ai44ActionProofSchema.parse({
    ...evidenceCommon,
    state: 'AI44_ACTION_STAGING_ACCEPTED',
    acceptanceProfile: 'auth-browser',
    humanMfa: 'user-completed',
    checks: {
      staleSessionDenied: 'passed',
      freshMfaActionAccepted: 'passed',
      oneEffectCommitted: 'passed',
      oneTerminalReceiptPersisted: 'passed',
    },
    freshMfaAction: {
      staleDenied: 'passed',
      staleAttemptUsedMfaGate: false,
      freshReauthAccepted: 'passed',
    },
    actionId: action.id,
    executionId: request.id,
    receiptId: originalReceiptId,
    effectCount: forwardEffect.replayed ? 1 : 0,
    terminalReceiptCount: forwardReceipts.filter((receipt) => receipt.kind === 'succeeded').length,
    correlationIds: [request.correlation_id],
  });
  await mkdir(dirname(acceptanceOutputPath!), { recursive: true });
  await writeFile(acceptanceOutputPath!, `${JSON.stringify(actionEvidence, null, 2)}\n`, 'utf8');
});
