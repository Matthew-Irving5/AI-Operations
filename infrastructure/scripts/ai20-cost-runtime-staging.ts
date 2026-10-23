import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { stagingTarget } from '../../apps/web/lib/live-e2e-safety.js';

const UuidSchema = z.string().uuid();
const DecimalSchema = z.string().regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/);
const ModelRouteSchema = z.enum(['gpt-5.6-luna', 'gpt-5.6-terra']);
const EvaluationResultSchema = z
  .object({
    passed: z.boolean(),
    caseCount: z.number().int(),
    managerCount: z.number().int(),
    safetyPassed: z.boolean(),
    evidencePassed: z.boolean(),
    toolAuthorityPassed: z.boolean(),
    schemaPassed: z.boolean(),
    costPassed: z.boolean(),
    latencyPassed: z.boolean(),
  })
  .passthrough();
const PromptCandidateSchema = z
  .object({
    id: UuidSchema,
    version: z.number().int().positive(),
    model_route: ModelRouteSchema,
    schema_version: z.number().int(),
    tool_policy_version: z.number().int(),
    json_schema: z.unknown(),
    tool_policy: z.record(z.string(), z.unknown()),
    evaluation_status: z.enum(['evaluated', 'approved', 'promoted']),
    evaluation_result: EvaluationResultSchema,
  })
  .strict();

const SnapshotSchema = z
  .object({
    models: z.array(
      z.object({ id: UuidSchema, model_id: ModelRouteSchema, enabled: z.boolean() }).strict(),
    ),
    effective_prices: z.array(
      z
        .object({
          id: UuidSchema,
          model_id: UuidSchema,
          input_per_million: DecimalSchema,
          output_per_million: DecimalSchema,
          web_search_per_call: DecimalSchema,
        })
        .strict(),
    ),
    prompt_versions: z.array(
      z
        .object({
          id: UuidSchema,
          model_route: ModelRouteSchema,
          schema_version: z.number().int(),
          tool_policy_version: z.number().int(),
        })
        .strict(),
    ),
    prompt_candidates: z.array(PromptCandidateSchema),
    runs: z.array(
      z
        .object({
          id: UuidSchema,
          correlation_id: UuidSchema,
          budget_reservation_id: UuidSchema.nullable(),
          status: z.string(),
          error_code: z.string().nullable(),
          trigger: z.string(),
          idempotency_key: z.string(),
        })
        .strict(),
    ),
    jobs: z.array(z.object({ status: z.string() }).strict()),
    reports: z.array(
      z.object({ id: UuidSchema, structured_metrics: z.record(z.string(), z.unknown()) }).strict(),
    ),
    notifications: z.array(z.object({ status: z.string(), type: z.string() }).strict()),
    calls: z.array(
      z
        .object({
          id: UuidSchema,
          status: z.string(),
          model_id: z.string(),
          model_pricing_id: UuidSchema,
          response_id: z.string().nullable(),
          estimated_cost: DecimalSchema,
          actual_cost: DecimalSchema.nullable(),
          actual_input_tokens: z.number().int().nullable(),
          cached_input_tokens: z.number().int(),
          cache_write_tokens: z.number().int(),
          actual_output_tokens: z.number().int().nullable(),
          reasoning_tokens: z.number().int(),
          search_calls: z.number().int(),
          provider_usage: z.record(z.string(), z.unknown()),
          prompt_version_id: UuidSchema,
          model_route: ModelRouteSchema,
          schema_version: z.number().int(),
          tool_policy_version: z.number().int(),
        })
        .strict(),
    ),
    actions: z.array(z.object({ id: UuidSchema, status: z.string() }).strict()),
    budgets: z.array(
      z
        .object({
          hard_cap: DecimalSchema,
          reserved_amount: DecimalSchema,
          actual_amount: DecimalSchema,
          model_ceiling: ModelRouteSchema,
          search_ceiling: z.number().int(),
          status: z.string(),
        })
        .strict(),
    ),
    reservations: z.array(
      z
        .object({
          id: UuidSchema,
          run_id: UuidSchema,
          category: z.string(),
          reserved_amount: DecimalSchema,
          consumed_amount: DecimalSchema,
          released_amount: DecimalSchema,
          status: z.string(),
        })
        .strict(),
    ),
    prices: z.array(
      z
        .object({
          id: UuidSchema,
          model_id: z.string(),
          input_per_million: DecimalSchema,
          cached_input_per_million: DecimalSchema,
          output_per_million: DecimalSchema,
          cache_write_multiplier: DecimalSchema,
          web_search_per_call: DecimalSchema,
        })
        .strict(),
    ),
  })
  .strict();

const ManagementResponseSchema = z.array(z.object({ snapshot: SnapshotSchema }).strict()).length(1);

export type Ai20CostRuntimeSnapshot = z.infer<typeof SnapshotSchema>;
export type Ai20LunaPromptCandidate = z.infer<typeof PromptCandidateSchema>;

export function isAi20CostRuntimeSnapshotSettled(snapshot: Ai20CostRuntimeSnapshot): boolean {
  const run = snapshot.runs[0];
  const call = snapshot.calls[0];
  return (
    run?.status === 'succeeded' &&
    snapshot.jobs.length === 1 &&
    snapshot.jobs[0]?.status === 'succeeded' &&
    snapshot.reports.length === 1 &&
    snapshot.notifications.length === 1 &&
    snapshot.calls.length === 1 &&
    call?.status === 'succeeded' &&
    call.response_id !== null &&
    call.actual_cost !== null &&
    call.actual_input_tokens !== null &&
    call.actual_output_tokens !== null &&
    call.provider_usage.has_complete_usage === true &&
    snapshot.budgets.length === 1 &&
    snapshot.reservations.length === 1 &&
    snapshot.reservations[0]?.status === 'consumed' &&
    snapshot.prices.length === 1
  );
}

type StagingEnvironment = Record<string, string | undefined>;

type QueryInput = {
  runId: string;
  promptTemplateId: string;
  promptVersion: number;
};

function validatedInput(input: QueryInput) {
  return {
    runId: UuidSchema.parse(input.runId),
    promptTemplateId: UuidSchema.parse(input.promptTemplateId),
    promptVersion: z.number().int().positive().parse(input.promptVersion),
  };
}

function snapshotQuery(input: QueryInput): string {
  const { runId, promptTemplateId, promptVersion } = validatedInput(input);
  return `with target as (
    select '${runId}'::uuid as run_id, '${promptTemplateId}'::uuid as template_id, ${promptVersion}::integer as prompt_version
  )
  select jsonb_build_object(
    'models', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', model.id::text, 'model_id', model.model_id, 'enabled', model.enabled
      ))
      from public.ai_model_catalog model where model.model_id = 'gpt-5.6-luna'
    ), '[]'::jsonb),
    'effective_prices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', price.id::text, 'model_id', price.model_id::text,
        'input_per_million', price.input_per_million::text,
        'output_per_million', price.output_per_million::text,
        'web_search_per_call', price.web_search_per_call::text
      ))
      from (
        select current_price.id, current_price.model_id, current_price.input_per_million,
          current_price.output_per_million, current_price.web_search_per_call
        from public.model_pricing current_price
        where current_price.model_id = (
          select model.id from public.ai_model_catalog model
          where model.model_id = 'gpt-5.6-luna' and model.enabled
        )
          and current_price.effective_from <= now()
        order by current_price.effective_from desc, current_price.id desc
        limit 1
      ) price
    ), '[]'::jsonb),
    'prompt_versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', prompt.id::text, 'model_route', prompt.model_route,
        'schema_version', prompt.schema_version, 'tool_policy_version', prompt.tool_policy_version
      ))
      from public.prompt_versions prompt, target
      where prompt.template_id = target.template_id and prompt.version = target.prompt_version
    ), '[]'::jsonb),
    'prompt_candidates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', prompt.id::text, 'version', prompt.version, 'model_route', prompt.model_route,
        'schema_version', prompt.schema_version, 'tool_policy_version', prompt.tool_policy_version,
        'json_schema', prompt.json_schema, 'tool_policy', prompt.tool_policy,
        'evaluation_status', prompt.evaluation_status,
        'evaluation_result', prompt.evaluation_result
      ))
      from public.prompt_versions prompt, target
      where prompt.template_id = target.template_id
        and prompt.model_route = 'gpt-5.6-luna'
        and prompt.evaluation_status in ('evaluated', 'promoted')
        and prompt.evaluation_result is not null
    ), '[]'::jsonb),
    'runs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', run.id::text, 'correlation_id', run.correlation_id::text,
        'budget_reservation_id', run.budget_reservation_id::text,
        'status', run.status, 'error_code', run.error_code, 'trigger', run.trigger,
        'idempotency_key', run.idempotency_key
      ))
      from public.workflow_runs run, target where run.id = target.run_id
    ), '[]'::jsonb),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object('status', job.status))
      from public.job_queue job, target where job.run_id = target.run_id
    ), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', report.id::text, 'structured_metrics', report.structured_metrics
      ))
      from public.reports report, target where report.run_id = target.run_id
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object('status', notification.status, 'type', notification.type))
      from public.notifications notification, target
      where notification.dedupe_key = 'workflow-report:' || target.run_id::text
    ), '[]'::jsonb),
    'calls', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', call.id::text, 'status', call.status, 'model_id', call.model_id,
        'model_pricing_id', call.model_pricing_id::text, 'response_id', call.response_id,
        'estimated_cost', call.estimated_cost::text, 'actual_cost', call.actual_cost::text,
        'actual_input_tokens', call.actual_input_tokens, 'cached_input_tokens', call.cached_input_tokens,
        'cache_write_tokens', call.cache_write_tokens, 'actual_output_tokens', call.actual_output_tokens,
        'reasoning_tokens', call.reasoning_tokens, 'search_calls', call.search_calls,
        'provider_usage', call.provider_usage, 'prompt_version_id', call.prompt_version_id::text,
        'model_route', call.model_route, 'schema_version', call.schema_version,
        'tool_policy_version', call.tool_policy_version
      ))
      from public.ai_calls call, target where call.run_id = target.run_id
    ), '[]'::jsonb),
    'actions', coalesce((
      select jsonb_agg(jsonb_build_object('id', action.id::text, 'status', action.status))
      from public.actions action, target where action.run_id = target.run_id
    ), '[]'::jsonb),
    'budgets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'hard_cap', budget.hard_cap::text, 'reserved_amount', budget.reserved_amount::text,
        'actual_amount', budget.actual_amount::text, 'model_ceiling', budget.model_ceiling,
        'search_ceiling', budget.search_ceiling, 'status', budget.status
      ))
      from public.on_demand_budgets budget, target where budget.run_id = target.run_id
    ), '[]'::jsonb),
    'reservations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', reservation.id::text, 'run_id', reservation.run_id::text,
        'category', reservation.category, 'reserved_amount', reservation.reserved_amount::text,
        'consumed_amount', reservation.consumed_amount::text,
        'released_amount', reservation.released_amount::text, 'status', reservation.status
      ))
      from public.cost_reservations reservation
      where reservation.id = (
        select run.budget_reservation_id from public.workflow_runs run, target where run.id = target.run_id
      )
    ), '[]'::jsonb),
    'prices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', price.id::text, 'model_id', price.model_id,
        'input_per_million', price.input_per_million::text,
        'cached_input_per_million', price.cached_input_per_million::text,
        'output_per_million', price.output_per_million::text,
        'cache_write_multiplier', price.cache_write_multiplier::text,
        'web_search_per_call', price.web_search_per_call::text
      ))
      from public.model_pricing price
      where price.id in (
        select call.model_pricing_id from public.ai_calls call, target where call.run_id = target.run_id
      )
    ), '[]'::jsonb)
  ) as snapshot`;
}

export async function readAi20CostRuntimeSnapshot(
  input: QueryInput,
  environment: StagingEnvironment = process.env,
  request: typeof fetch = fetch,
): Promise<Ai20CostRuntimeSnapshot> {
  const { runId, promptTemplateId, promptVersion } = validatedInput(input);
  const projectRef = environment.STAGING_PROJECT_REF;
  const projectUrl = environment.STAGING_PROJECT_URL;
  const token = environment.STAGING_PERSONAL_ACCESS_TOKEN;
  let projectOrigin = '';
  try {
    projectOrigin = new URL(projectUrl ?? '').origin;
  } catch {
    // The fixed-target guard below returns a safe configuration error.
  }
  if (
    projectRef !== stagingTarget.projectRef ||
    projectOrigin !== stagingTarget.supabaseUrl ||
    !token
  ) {
    throw new Error(
      'AI-20 accounting reads require the fixed staging project and STAGING_PERSONAL_ACCESS_TOKEN; no request was made.',
    );
  }

  const response = await request(
    `https://api.supabase.com/v1/projects/${stagingTarget.projectRef}/database/query/read-only`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: snapshotQuery({ runId, promptTemplateId, promptVersion }),
      }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `AI-20 read-only staging accounting query failed with HTTP ${response.status}.`,
    );
  }
  const rows = ManagementResponseSchema.parse(await response.json());
  return rows[0]!.snapshot;
}

export async function assertAi20CostRuntimeReadiness(
  environment: StagingEnvironment = process.env,
  request: typeof fetch = fetch,
): Promise<void> {
  const emptyId = '00000000-0000-0000-0000-000000000000';
  const snapshot = await readAi20CostRuntimeSnapshot(
    { runId: emptyId, promptTemplateId: emptyId, promptVersion: 1 },
    environment,
    request,
  );
  if (
    snapshot.prompt_versions.length !== 0 ||
    snapshot.prompt_candidates.length !== 0 ||
    snapshot.runs.length !== 0 ||
    snapshot.calls.length !== 0 ||
    snapshot.actions.length !== 0 ||
    snapshot.jobs.length !== 0 ||
    snapshot.reports.length !== 0 ||
    snapshot.notifications.length !== 0 ||
    snapshot.budgets.length !== 0 ||
    snapshot.reservations.length !== 0 ||
    snapshot.prices.length !== 0
  ) {
    throw new Error(
      'AI-20 accounting read preflight returned rows for reserved empty identifiers.',
    );
  }
  assertAi20LunaBudgetPreflight(snapshot, 0.05);
}

export function assertAi20LunaBudgetPreflight(
  snapshot: Ai20CostRuntimeSnapshot,
  hardCapUsd: number,
): number {
  if (
    snapshot.models.length !== 1 ||
    snapshot.models[0]?.model_id !== 'gpt-5.6-luna' ||
    snapshot.models[0]?.enabled !== true ||
    snapshot.effective_prices.length !== 1 ||
    snapshot.effective_prices[0]?.model_id !== snapshot.models[0]?.id
  ) {
    throw new Error(
      'AI-20 budget preflight requires one enabled Luna model and one effective price.',
    );
  }
  const price = snapshot.effective_prices[0]!;
  const estimatedUsd =
    Math.ceil(
      ((8_000 * Number(price.input_per_million) + 2_000 * Number(price.output_per_million)) /
        1_000_000) *
        1_000_000,
    ) / 1_000_000;
  if (
    !Number.isFinite(estimatedUsd) ||
    estimatedUsd <= 0 ||
    estimatedUsd > hardCapUsd ||
    Number(price.web_search_per_call) < 0
  ) {
    throw new Error('AI-20 budget preflight estimate does not fit the bounded workflow hard cap.');
  }
  return estimatedUsd;
}

export function selectAi20LunaPromptCandidate(
  snapshot: Ai20CostRuntimeSnapshot,
  expected: {
    schemaVersion: number;
    toolPolicyVersion: number;
    schema: unknown;
    toolPolicy: unknown;
  },
): Ai20LunaPromptCandidate {
  const candidates = snapshot.prompt_candidates
    .filter(
      (candidate) =>
        candidate.model_route === 'gpt-5.6-luna' &&
        candidate.schema_version === expected.schemaVersion &&
        isDeepStrictEqual(candidate.json_schema, expected.schema) &&
        candidate.tool_policy_version === expected.toolPolicyVersion &&
        isDeepStrictEqual(candidate.tool_policy, expected.toolPolicy) &&
        candidate.tool_policy.version === expected.toolPolicyVersion &&
        Array.isArray(candidate.tool_policy.tools) &&
        candidate.tool_policy.tools.length === 0 &&
        ['evaluated', 'promoted'].includes(candidate.evaluation_status) &&
        candidate.evaluation_result.passed &&
        candidate.evaluation_result.caseCount === 24 &&
        candidate.evaluation_result.managerCount === 8 &&
        candidate.evaluation_result.safetyPassed &&
        candidate.evaluation_result.evidencePassed &&
        candidate.evaluation_result.toolAuthorityPassed &&
        candidate.evaluation_result.schemaPassed &&
        candidate.evaluation_result.costPassed &&
        candidate.evaluation_result.latencyPassed,
    )
    .sort((left, right) => right.version - left.version);
  const candidate = candidates[0];
  if (!candidate) {
    throw new Error(
      'No passed staging Luna prompt matches the active schema and empty-tool policy; no provider call is allowed.',
    );
  }
  return candidate;
}
