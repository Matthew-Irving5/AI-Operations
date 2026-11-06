import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertAi20LunaBudgetPreflight,
  assertAi20CostRuntimeReadiness,
  isAi20CostRuntimeSnapshotSettled,
  readAi20CostRuntimeSnapshot,
  selectAi20LunaPromptCandidate,
  type Ai20CostRuntimeSnapshot,
} from './ai20-cost-runtime-staging.js';

const environment = {
  STAGING_PROJECT_REF: 'jqtssfrfocnibffdkqch',
  STAGING_PROJECT_URL: 'https://jqtssfrfocnibffdkqch.supabase.co',
  STAGING_PERSONAL_ACCESS_TOKEN: 'test-only-token',
};

const emptySnapshot = {
  models: [
    {
      id: '00000000-0000-4000-8000-000000000011',
      model_id: 'gpt-5.6-luna',
      enabled: true,
    },
  ],
  effective_prices: [
    {
      id: '00000000-0000-4000-8000-000000000012',
      model_id: '00000000-0000-4000-8000-000000000011',
      input_per_million: '0.25',
      output_per_million: '2',
      web_search_per_call: '0.01',
    },
  ],
  prompt_versions: [],
  prompt_candidates: [],
  jobs: [],
  reports: [],
  notifications: [],
  runs: [],
  calls: [],
  actions: [],
  budgets: [],
  reservations: [],
  prices: [],
};

function promptCandidate(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    version: 3,
    model_route: 'gpt-5.6-luna',
    schema_version: 2,
    tool_policy_version: 4,
    json_schema: { type: 'object', required: ['result'] },
    tool_policy: { version: 4, tools: [] },
    evaluation_status: 'evaluated',
    evaluation_result: {
      passed: true,
      caseCount: 24,
      managerCount: 8,
      safetyPassed: true,
      evidencePassed: true,
      toolAuthorityPassed: true,
      schemaPassed: true,
      costPassed: true,
      latencyPassed: true,
    },
    ...overrides,
  };
}

test('AI-20 selects the highest fully evaluated Luna prompt matching active contracts', () => {
  const snapshot = {
    ...emptySnapshot,
    prompt_candidates: [
      promptCandidate({ version: 3 }),
      promptCandidate({ version: 8 }),
      promptCandidate({ version: 9, evaluation_status: 'approved' }),
    ],
  };

  assert.equal(
    selectAi20LunaPromptCandidate(snapshot, {
      schemaVersion: 2,
      toolPolicyVersion: 4,
      schema: { type: 'object', required: ['result'] },
      toolPolicy: { version: 4, tools: [] },
    }).version,
    8,
  );
});

test('AI-20 rejects Luna prompts that fail governance or have tool authority', () => {
  const snapshot = {
    ...emptySnapshot,
    prompt_candidates: [
      promptCandidate({
        version: 3,
        evaluation_result: {
          passed: false,
          caseCount: 24,
          managerCount: 8,
          safetyPassed: true,
          evidencePassed: true,
          toolAuthorityPassed: true,
          schemaPassed: true,
          costPassed: true,
          latencyPassed: true,
        },
      }),
      promptCandidate({ version: 4, tool_policy: { version: 4, tools: ['web_search'] } }),
      promptCandidate({ version: 5, schema_version: 3 }),
      promptCandidate({ version: 6, json_schema: { type: 'string' } }),
    ],
  };

  assert.throws(
    () =>
      selectAi20LunaPromptCandidate(snapshot, {
        schemaVersion: 2,
        toolPolicyVersion: 4,
        schema: { type: 'object', required: ['result'] },
        toolPolicy: { version: 4, tools: [] },
      }),
    /No passed staging Luna prompt matches/,
  );
});

test('AI-20 budget preflight uses the effective Luna price and enforces the $0.05 cap', () => {
  assert.equal(assertAi20LunaBudgetPreflight(emptySnapshot, 0.05), 0.006);
  assert.throws(
    () => assertAi20LunaBudgetPreflight(emptySnapshot, 0.005),
    /does not fit the bounded workflow hard cap/,
  );
});

test('AI-20 waits for settled provider accounting after a successful run status', () => {
  const settled = {
    ...emptySnapshot,
    runs: [
      {
        id: '00000000-0000-4000-8000-000000000021',
        correlation_id: '00000000-0000-4000-8000-000000000022',
        budget_reservation_id: '00000000-0000-4000-8000-000000000023',
        status: 'succeeded',
        error_code: null,
        trigger: 'on_demand',
        idempotency_key: 'test-idempotency-key',
      },
    ],
    jobs: [{ status: 'succeeded' }],
    reports: [
      {
        id: '00000000-0000-4000-8000-000000000024',
        structured_metrics: { actual_cost: '0.001' },
      },
    ],
    notifications: [{ status: 'pending', type: 'report' }],
    calls: [
      {
        id: '00000000-0000-4000-8000-000000000025',
        status: 'succeeded',
        model_id: '00000000-0000-4000-8000-000000000011',
        model_pricing_id: '00000000-0000-4000-8000-000000000026',
        response_id: 'resp_abcdef123456',
        estimated_cost: '0.006',
        actual_cost: '0.001',
        actual_input_tokens: 425,
        cached_input_tokens: 0,
        cache_write_tokens: 0,
        actual_output_tokens: 85,
        reasoning_tokens: 0,
        search_calls: 0,
        provider_usage: { has_complete_usage: true },
        prompt_version_id: '00000000-0000-4000-8000-000000000027',
        model_route: 'gpt-5.6-luna',
        schema_version: 2,
        tool_policy_version: 4,
      },
    ],
    budgets: [
      {
        hard_cap: '0.05',
        reserved_amount: '0',
        actual_amount: '0.001',
        model_ceiling: 'gpt-5.6-luna',
        search_ceiling: 0,
        status: 'active',
      },
    ],
    reservations: [
      {
        id: '00000000-0000-4000-8000-000000000023',
        run_id: '00000000-0000-4000-8000-000000000021',
        category: 'on_demand',
        reserved_amount: '0.006',
        consumed_amount: '0.001',
        released_amount: '0.005',
        status: 'consumed',
      },
    ],
    prices: [
      {
        id: '00000000-0000-4000-8000-000000000026',
        model_id: '00000000-0000-4000-8000-000000000011',
        input_per_million: '0.25',
        cached_input_per_million: '0.025',
        output_per_million: '2',
        cache_write_multiplier: '1',
        web_search_per_call: '0.01',
      },
    ],
  } satisfies Ai20CostRuntimeSnapshot;

  const stillSettling: Ai20CostRuntimeSnapshot = {
    ...settled,
    calls: [
      {
        ...settled.calls[0]!,
        response_id: null,
        actual_cost: null,
        actual_input_tokens: null,
        actual_output_tokens: null,
      },
    ],
  };
  assert.equal(isAi20CostRuntimeSnapshotSettled(stillSettling), false);
  assert.equal(isAi20CostRuntimeSnapshotSettled(settled), true);
  assert.equal(
    isAi20CostRuntimeSnapshotSettled({
      ...settled,
      runs: [{ ...settled.runs[0]!, status: 'failed' }],
    }),
    false,
  );
});

test('AI-20 accounting preflight uses read-only Management SQL on the fixed staging project', async () => {
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  await assertAi20CostRuntimeReadiness(environment, async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify([{ snapshot: emptySnapshot }]), { status: 200 });
  });

  assert.equal(
    requestUrl,
    'https://api.supabase.com/v1/projects/jqtssfrfocnibffdkqch/database/query/read-only',
  );
  assert.equal(requestInit?.method, 'POST');
  assert.deepEqual(requestInit?.headers, {
    Authorization: 'Bearer test-only-token',
    'Content-Type': 'application/json',
  });
  const body = JSON.parse(String(requestInit?.body)) as { query: string };
  assert.deepEqual(Object.keys(body), ['query']);
  assert.match(body.query, /^with target as \(/);
  assert.match(body.query, /'prompt_versions'/);
  assert.match(body.query, /public\.cost_reservations/);
  assert.match(body.query, /public\.on_demand_budgets/);
  assert.match(body.query, /public\.actions/);
  assert.match(body.query, /public\.ai_model_catalog/);
  assert.match(body.query, /public\.job_queue/);
  assert.doesNotMatch(body.query, /\b(insert|update|delete|alter|drop)\b/i);
});

test('AI-20 accounting reader rejects non-staging projects before requesting data', async () => {
  let requested = false;
  await assert.rejects(
    readAi20CostRuntimeSnapshot(
      {
        runId: '00000000-0000-0000-0000-000000000000',
        promptTemplateId: '00000000-0000-0000-0000-000000000000',
        promptVersion: 1,
      },
      { ...environment, STAGING_PROJECT_REF: 'production-project' },
      async () => {
        requested = true;
        return new Response('[]', { status: 200 });
      },
    ),
    /fixed staging project/,
  );
  assert.equal(requested, false);
});

test('AI-20 accounting reader reports only the response status and never echoes its token', async () => {
  await assert.rejects(
    readAi20CostRuntimeSnapshot(
      {
        runId: '00000000-0000-0000-0000-000000000000',
        promptTemplateId: '00000000-0000-0000-0000-000000000000',
        promptVersion: 1,
      },
      environment,
      async () => new Response('test-only-token diagnostic', { status: 403 }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /HTTP 403/);
      assert.doesNotMatch(error.message, /test-only-token/);
      return true;
    },
  );
});
