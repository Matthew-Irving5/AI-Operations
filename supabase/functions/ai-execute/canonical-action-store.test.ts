import {
  createSupabaseCanonicalActionExecutionStore,
  type CanonicalActionRpcClient,
} from './canonical-action-store.ts';

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`assertion_failed:${JSON.stringify({ actual, expected })}`);
  }
}

const identity = {
  userId: '00000000-0000-4000-8000-000000000101',
  executionRequestId: '00000000-0000-4000-8000-000000000102',
  idempotencyKey: 'ai44-execution-1',
  requestFingerprint: `sha256:${'a'.repeat(64)}`,
};

Deno.test('Supabase action store uses the atomic scoped RPC contract', async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const responses: unknown[] = [
    { kind: 'missing' },
    true,
    {
      kind: 'claimed',
      claimToken: '00000000-0000-4000-8000-000000000103',
      attempt: 1,
    },
    {
      kind: 'persisted',
      receipt: {
        contractVersion: 1,
        id: '00000000-0000-4000-8000-000000000104',
        userId: identity.userId,
        executionRequestId: identity.executionRequestId,
        actionId: null,
        actionType: 'google_task_create',
        authority: 'verified_user',
        channel: 'gmail',
        policyDecision: 'allow',
        policyReason: 'verified_user_authority',
        kind: 'succeeded',
        summary: 'Task created',
        resultReference: null,
        changedReferences: ['task:example'],
        errorCode: null,
        redactedError: null,
        reversalToken: null,
        idempotencyKey: identity.idempotencyKey,
        requestFingerprint: identity.requestFingerprint,
        correlationId: '00000000-0000-4000-8000-000000000105',
        attempt: 1,
        createdAt: '2026-10-21T12:00:00.000Z',
      },
    },
  ];
  const client: CanonicalActionRpcClient = {
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: responses.shift(), error: null };
    },
  };
  const store = createSupabaseCanonicalActionExecutionStore(client);
  assertEquals(await store.lookup(identity), { kind: 'missing' });
  assertEquals(
    await store.recordPolicyDecision(identity, {
      policyVersion: 1,
      actionType: 'google_task_create',
      decision: 'allow',
      reason: 'verified_user_authority',
      effectiveRisk: 'low',
      requiredCapability: 'reminder_write',
      requiredPermissions: ['write', 'execute'],
      approvalRequired: false,
      freshWebAal2Required: false,
      reversible: true,
    }),
    undefined,
  );
  assertEquals(await store.claim(identity), {
    kind: 'claimed',
    claimToken: '00000000-0000-4000-8000-000000000103',
    attempt: 1,
  });
  const receiptDraft = {
    contractVersion: 1 as const,
    userId: identity.userId,
    executionRequestId: identity.executionRequestId,
    actionId: null,
    actionType: 'google_task_create' as const,
    authority: 'verified_user' as const,
    channel: 'gmail' as const,
    policyDecision: 'allow' as const,
    policyReason: 'verified_user_authority' as const,
    kind: 'succeeded' as const,
    summary: 'Task created',
    resultReference: null,
    changedReferences: ['task:example'],
    errorCode: null,
    redactedError: null,
    reversalToken: null,
    idempotencyKey: identity.idempotencyKey,
    requestFingerprint: identity.requestFingerprint,
    correlationId: '00000000-0000-4000-8000-000000000105',
    attempt: 1,
  };
  const completed = await store.complete(
    identity,
    '00000000-0000-4000-8000-000000000103',
    receiptDraft,
  );
  assertEquals(completed.kind, 'persisted');
  assertEquals(
    calls.map((call) => call.name),
    [
      'lookup_canonical_action_execution',
      'record_canonical_action_policy_decision',
      'claim_canonical_action_execution',
      'complete_canonical_action_execution',
    ],
  );
  assertEquals(calls[0]?.args, {
    p_user_id: identity.userId,
    p_execution_request_id: identity.executionRequestId,
    p_idempotency_key: identity.idempotencyKey,
    p_request_fingerprint: identity.requestFingerprint,
  });
});

Deno.test('ai-execute has a deployment-resolved manager-core subpath', async () => {
  const [configText, importMapText] = await Promise.all([
    Deno.readTextFile('./supabase/config.toml'),
    Deno.readTextFile('./supabase/functions/deno.json'),
  ]);
  const importMap = JSON.parse(importMapText) as {
    imports?: Record<string, unknown>;
  };
  if (
    !configText.includes('[functions.ai-execute]') ||
    !configText.includes('import_map = "./functions/deno.json"')
  ) {
    throw new Error('ai_execute_deployment_import_map_not_registered');
  }
  assertEquals(
    importMap.imports?.['@ai-operations/manager-core/action-execution'],
    '../../packages/manager-core/src/action-execution.ts',
  );
});
