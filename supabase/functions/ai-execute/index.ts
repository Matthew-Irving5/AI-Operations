import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { reportOutputSchema } from "../_shared/openai-contract.ts";
import { createWorkflowExecutionHandler } from "./handler.ts";
import { submitProviderResponse as submitProviderResponseWithRetry } from "./provider-submission.ts";
import {
  allowedActionTypesForWorkflow,
  resolveWorkflowMode,
  selectModelUnderCeiling,
} from "./execution-policy.ts";
import {
  type ExecuteWorkflowOutcome,
  loadTrustedWorkflowExecution,
  type WorkflowExecutionSource,
} from "./orchestration-contract.ts";

const service = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

const outcomeFor = (
  runId: string,
  outcome: "retryable_failure" | "terminal_failure",
  errorCode: string,
): ExecuteWorkflowOutcome => ({ runId, outcome, errorCode });

async function submitProviderResponse(
  runId: string,
  responseId: string,
): Promise<{ id: string; status: string } | null> {
  return await submitProviderResponseWithRetry(
    runId,
    responseId,
    async (candidateRunId, candidateResponseId) =>
      await service.rpc("submit_workflow_job_response", {
        p_run_id: candidateRunId,
        p_response_id: candidateResponseId,
      }),
  );
}

async function successOutcomeForExistingReport(
  runId: string,
): Promise<ExecuteWorkflowOutcome | null> {
  const result = await service.from("reports").select("id").eq("run_id", runId)
    .maybeSingle();
  return result.error || typeof result.data?.id !== "string"
    ? null
    : { runId, outcome: "succeeded", reportId: result.data.id };
}

const relationRecord = (value: unknown): Record<string, unknown> | null => {
  const relation = Array.isArray(value) ? value[0] : value;
  return isRecord(relation) ? relation : null;
};

function executionSource(): WorkflowExecutionSource {
  return {
    async loadRun(runId) {
      const result = await service
        .from("workflow_runs")
        .select(
          "id,user_id,workflow_definition_id,status,trigger,correlation_id,idempotency_key,priority,requested_at,started_at,completed_at,cancelled_at,error_code,redacted_error,report_id,budget_reservation_id,workflow_definitions!inner(id,code,version,manager_id,managers!inner(code),trigger_type,input_schema,output_schema,active)",
        )
        .eq("id", runId)
        .maybeSingle();
      if (result.error || !result.data) return null;
      const definition = relationRecord(result.data.workflow_definitions);
      const manager = relationRecord(definition?.managers);
      if (!definition || !manager) return null;
      return {
        contractVersion: 1,
        id: result.data.id,
        userId: result.data.user_id,
        workflowDefinitionId: result.data.workflow_definition_id,
        managerCode: manager.code,
        status: result.data.status,
        trigger: result.data.trigger,
        correlationId: result.data.correlation_id,
        idempotencyKey: result.data.idempotency_key,
        priority: result.data.priority,
        requestedAt: result.data.requested_at,
        startedAt: result.data.started_at,
        completedAt: result.data.completed_at,
        cancelledAt: result.data.cancelled_at,
        errorCode: result.data.error_code,
        redactedError: result.data.redacted_error,
        reportId: null,
        budgetReservationId: result.data.budget_reservation_id,
      };
    },
    async loadDefinition(definitionId) {
      const result = await service
        .from("workflow_definitions")
        .select(
          "id,code,version,manager_id,managers!inner(code),trigger_type,input_schema,output_schema,active",
        )
        .eq("id", definitionId)
        .maybeSingle();
      if (result.error || !result.data) return null;
      const manager = relationRecord(result.data.managers);
      if (!manager) return null;
      return {
        contractVersion: 1,
        id: result.data.id,
        managerCode: manager.code,
        code: result.data.code,
        version: result.data.version,
        triggerType: result.data.trigger_type,
        inputSchema: result.data.input_schema,
        outputSchema: result.data.output_schema,
        active: result.data.active,
      };
    },
    async loadInput(runId) {
      const result = await service
        .from("job_queue")
        .select("payload")
        .eq("run_id", runId)
        .eq("job_type", "workflow_execute")
        .maybeSingle();
      if (result.error || !result.data) return null;
      const payload: unknown = result.data.payload;
      if (!isRecord(payload)) return null;
      if (isRecord(payload.request)) return payload.request;
      const requestEntries = Object.entries(payload).filter(
        ([key]) => !["run_id", "schedule_id"].includes(key),
      );
      return requestEntries.length === 0
        ? {}
        : Object.fromEntries(requestEntries);
    },
  };
}

async function persistStage(
  run: { id: string; correlationId: string },
  stepCode: string,
  sequence: number,
  status: "running" | "succeeded" | "failed",
  reference: string | null,
  redactedError: string | null = null,
): Promise<void> {
  const result = await service.rpc("record_workflow_stage", {
    p_run_id: run.id,
    p_step_code: stepCode,
    p_sequence: sequence,
    p_status: status,
    p_input_reference: reference,
    p_output_reference: status === "succeeded"
      ? `run_steps:${run.id}:${stepCode}`
      : null,
    p_redacted_error: redactedError,
  });
  if (result.error) throw new Error("stage_persistence_failed");
}

async function executeDeterministic(
  runId: string,
): Promise<ExecuteWorkflowOutcome> {
  const run = await service.from("workflow_runs").select("correlation_id").eq(
    "id",
    runId,
  ).maybeSingle();
  if (run.error || !run.data) {
    return outcomeFor(
      runId,
      "retryable_failure",
      "deterministic_run_unavailable",
    );
  }
  const stageRun = { id: runId, correlationId: run.data.correlation_id };
  await persistStage(
    stageRun,
    "validate_inputs",
    1,
    "succeeded",
    `workflow_runs:${runId}`,
  );
  await persistStage(
    stageRun,
    "load_context",
    2,
    "succeeded",
    `workflow_runs:${runId}`,
  );
  await persistStage(
    stageRun,
    "deterministic_execution",
    3,
    "running",
    `workflow_runs:${runId}`,
  );
  const result = await service.rpc("complete_deterministic_workflow_run", {
    p_run_id: runId,
  });
  if (result.error || typeof result.data !== "string") {
    await persistStage(
      stageRun,
      "deterministic_execution",
      3,
      "failed",
      `workflow_runs:${runId}`,
      "deterministic_execution_failed",
    );
    return outcomeFor(
      runId,
      "retryable_failure",
      "deterministic_execution_failed",
    );
  }
  await persistStage(
    stageRun,
    "deterministic_execution",
    3,
    "succeeded",
    `reports:${result.data}`,
  );
  await persistStage(
    stageRun,
    "validate_output",
    4,
    "succeeded",
    `reports:${result.data}`,
  );
  await persistStage(
    stageRun,
    "post_process",
    5,
    "succeeded",
    `reports:${result.data}`,
  );
  await persistStage(
    stageRun,
    "persist_actions",
    6,
    "succeeded",
    `reports:${result.data}`,
  );
  await persistStage(
    stageRun,
    "persist_evidence",
    7,
    "succeeded",
    `reports:${result.data}`,
  );
  await persistStage(
    stageRun,
    "persist_report",
    8,
    "succeeded",
    `reports:${result.data}`,
  );
  await persistStage(
    stageRun,
    "notification_decision",
    9,
    "succeeded",
    `workflow_runs:${runId}`,
  );
  return { runId, outcome: "succeeded", reportId: result.data };
}

async function executeAiWorkflow(
  execution: Awaited<ReturnType<typeof loadTrustedWorkflowExecution>>,
): Promise<ExecuteWorkflowOutcome> {
  const { run, definition, input } = execution;
  const mode = resolveWorkflowMode(run.managerCode, definition.code);
  if (!mode) {
    return outcomeFor(
      run.id,
      "terminal_failure",
      "workflow_capability_missing",
    );
  }
  if (mode === "deterministic") return await executeDeterministic(run.id);
  const allowedActionTypes = allowedActionTypesForWorkflow(
    run.managerCode,
    definition.code,
  );
  if (!definition.active) {
    return outcomeFor(
      run.id,
      "terminal_failure",
      "workflow_definition_inactive",
    );
  }
  await persistStage(
    run,
    "validate_inputs",
    1,
    "succeeded",
    `workflow_runs:${run.id}`,
  );
  await persistStage(
    run,
    "load_context",
    2,
    "running",
    `workflow_definitions:${definition.id}`,
  );

  const { data: existingReport } = await service
    .from("reports")
    .select("id,structured_metrics")
    .eq("run_id", run.id)
    .maybeSingle();
  const existingCallId = isRecord(existingReport?.structured_metrics) &&
      typeof existingReport.structured_metrics.ai_call_id === "string"
    ? existingReport.structured_metrics.ai_call_id
    : null;
  if (existingReport?.id && existingCallId) {
    const callState = await service.from("ai_calls").select("status").eq(
      "id",
      existingCallId,
    ).maybeSingle();
    if (callState.data?.status === "succeeded") {
      return {
        runId: run.id,
        outcome: "succeeded",
        reportId: existingReport.id,
      };
    }
  }

  const budgetResult = await service
    .from("on_demand_budgets")
    .select(
      "id,hard_cap,reserved_amount,model_ceiling,status,expires_at,search_ceiling",
    )
    .eq("run_id", run.id)
    .maybeSingle();
  if (budgetResult.error) {
    return outcomeFor(run.id, "terminal_failure", "execution_budget_missing");
  }
  const budget = budgetResult.data;
  if (
    budget &&
    (budget.status !== "active" || Date.parse(budget.expires_at) <= Date.now())
  ) {
    return outcomeFor(
      run.id,
      "terminal_failure",
      "execution_budget_unavailable",
    );
  }
  await persistStage(
    run,
    "reserve_budget",
    3,
    "running",
    `workflow_runs:${run.id}`,
  );

  const definitionResult = await service
    .from("workflow_definitions")
    .select(
      "id,manager_id,default_model_route,default_reasoning,budget_category,required_sources,notification_policy,approval_policy",
    )
    .eq("id", run.workflowDefinitionId)
    .maybeSingle();
  if (definitionResult.error || !definitionResult.data) {
    return outcomeFor(
      run.id,
      "terminal_failure",
      "workflow_definition_unavailable",
    );
  }
  const definitionConfig = definitionResult.data;
  const modelCeiling = budget?.model_ceiling ??
    definitionConfig.default_model_route;
  const selectedModel = selectModelUnderCeiling(
    definitionConfig.default_model_route,
    modelCeiling,
  );
  if (!selectedModel) {
    return outcomeFor(run.id, "terminal_failure", "model_route_unavailable");
  }
  const modelResult = await service
    .from("ai_model_catalog")
    .select("id,model_id,enabled")
    .eq("model_id", selectedModel)
    .eq("enabled", true)
    .maybeSingle();
  if (modelResult.error || !modelResult.data) {
    return outcomeFor(run.id, "terminal_failure", "model_unavailable");
  }

  const promptResult = await service
    .from("prompt_templates")
    .select("id,active_version")
    .eq("manager_id", definitionConfig.manager_id)
    .eq("code", "controlled-agent-report")
    .maybeSingle();
  if (promptResult.error || !promptResult.data?.active_version) {
    return outcomeFor(
      run.id,
      "terminal_failure",
      "approved_prompt_unavailable",
    );
  }
  const promptVersionResult = await service
    .from("prompt_versions")
    .select("id,system_text,developer_text,evaluation_status")
    .eq("template_id", promptResult.data.id)
    .eq("version", promptResult.data.active_version)
    .maybeSingle();
  if (
    promptVersionResult.error ||
    !promptVersionResult.data ||
    !["approved", "promoted"].includes(
      promptVersionResult.data.evaluation_status,
    )
  ) {
    return outcomeFor(
      run.id,
      "terminal_failure",
      "approved_prompt_unavailable",
    );
  }

  const feedbackResult = await service
    .from("feedback")
    .select("id,categories,created_at")
    .eq("user_id", run.userId)
    .eq("positive", false)
    .gte(
      "created_at",
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (feedbackResult.error) {
    return outcomeFor(
      run.id,
      "retryable_failure",
      "required_sources_unavailable",
    );
  }
  const evidence = (feedbackResult.data ?? []).flatMap((feedback) => {
    if (!Array.isArray(feedback.categories)) return [];
    return feedback.categories.flatMap((category) =>
      typeof category === "string"
        ? [{
          id: feedback.id,
          source: `Recent quality feedback category: ${category}`,
        }]
        : []
    );
  });
  const evidenceIds = [...new Set(evidence.map((item) => item.id))];
  const workflowInput = JSON.stringify({
    workflow: definition.code,
    request: input,
    evidence,
    constraints: {
      model: selectedModel,
      searchCalls: 0,
      approvalPolicy: definitionConfig.approval_policy,
    },
  });
  if (new TextEncoder().encode(workflowInput).byteLength > 24_000) {
    return outcomeFor(run.id, "terminal_failure", "workflow_context_too_large");
  }
  await persistStage(
    run,
    "load_context",
    2,
    "succeeded",
    `evidence:${evidenceIds.length}`,
  );

  const pricing = await service
    .from("model_pricing")
    .select(
      "input_per_million,output_per_million,cached_input_per_million,web_search_per_call",
    )
    .eq("model_id", modelResult.data.id)
    .lte("effective_from", new Date().toISOString())
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pricing.error || !pricing.data) {
    return outcomeFor(run.id, "terminal_failure", "model_pricing_unavailable");
  }
  const estimatedCost = Math.ceil(
    ((8_000 * pricing.data.input_per_million +
      2_000 * pricing.data.output_per_million) /
      1_000_000) *
      1_000_000,
  ) / 1_000_000;
  if (
    budget &&
    estimatedCost > Number(budget.hard_cap) - Number(budget.reserved_amount)
  ) {
    return outcomeFor(run.id, "terminal_failure", "execution_budget_exceeded");
  }
  const unresolvedCall = await service.from("ai_calls")
    .select("id,status,response_id,request_id")
    .eq("run_id", run.id)
    .in("status", [
      "submitted",
      "completed_pending_reconciliation",
      "reconciliation_failed",
    ])
    .not("response_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (unresolvedCall.error) {
    return outcomeFor(
      run.id,
      "retryable_failure",
      "ai_call_recovery_lookup_failed",
    );
  }
  if (unresolvedCall.data?.response_id) {
    const queueState = await submitProviderResponse(
      run.id,
      unresolvedCall.data.response_id,
    );
    if (queueState?.status === "succeeded") {
      const success = await successOutcomeForExistingReport(run.id);
      if (success) return success;
    }
    if (queueState?.status === "dead_letter") {
      return outcomeFor(
        run.id,
        "terminal_failure",
        "provider_response_timeout",
      );
    }
    if (queueState?.status !== "awaiting_provider") {
      return outcomeFor(
        run.id,
        "retryable_failure",
        "provider_queue_submission_failed",
      );
    }
    await persistStage(
      run,
      "invoke_ai",
      4,
      "succeeded",
      `ai_calls:${unresolvedCall.data.id}`,
    );
    await persistStage(
      run,
      "awaiting_provider",
      5,
      "running",
      `responses:${unresolvedCall.data.response_id}`,
    );
    return {
      runId: run.id,
      outcome: "submitted",
      responseId: unresolvedCall.data.response_id,
    };
  }
  const pendingReservation = await service.from("ai_calls")
    .select("id,status,response_id,request_id")
    .eq("run_id", run.id)
    .eq("status", "reserved")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pendingReservation.error) {
    return outcomeFor(
      run.id,
      "retryable_failure",
      "ai_call_recovery_lookup_failed",
    );
  }
  const attemptResult = await service.from("job_queue")
    .select("attempt_count")
    .eq("run_id", run.id)
    .eq("job_type", "workflow_execute")
    .maybeSingle();
  if (
    attemptResult.error || typeof attemptResult.data?.attempt_count !== "number"
  ) {
    return outcomeFor(run.id, "retryable_failure", "queue_attempt_unavailable");
  }
  const requestId = pendingReservation.data?.request_id ??
    `ai15:${run.id}:attempt:${Math.max(1, attemptResult.data.attempt_count)}`;
  const priorCallResult = pendingReservation.data
    ? { data: pendingReservation.data, error: null }
    : await service.from("ai_calls").select("id,status,response_id,request_id")
      .eq("request_id", requestId).maybeSingle();
  if (priorCallResult.error) {
    return outcomeFor(
      run.id,
      "retryable_failure",
      "ai_call_recovery_lookup_failed",
    );
  }
  if (priorCallResult.data && priorCallResult.data.status !== "reserved") {
    return outcomeFor(run.id, "terminal_failure", "ai_call_recovery_required");
  }
  if (!Deno.env.get("OPENAI_API_KEY")) {
    return outcomeFor(
      run.id,
      "retryable_failure",
      "provider_credential_unavailable",
    );
  }
  let callId = priorCallResult.data?.id;
  if (!callId) {
    const reservation = await service.rpc("reserve_instrumented_ai_call", {
      p_user_id: run.userId,
      p_run_id: run.id,
      p_model_id: modelResult.data.id,
      p_prompt_version_id: promptVersionResult.data.id,
      p_estimated_cost: estimatedCost,
      p_request_id: requestId,
      p_redacted_trace: {
        workflow: definition.code,
        prompt_version: promptResult.data.active_version,
        model: selectedModel,
        evidence_ids: evidenceIds,
        evidence_count: evidenceIds.length,
        reasoning: definitionConfig.default_reasoning,
        notification_policy: definitionConfig.notification_policy,
        allowed_action_types: allowedActionTypes,
        execution_mode: "ai",
      },
    });
    if (reservation.error || typeof reservation.data !== "string") {
      return outcomeFor(run.id, "terminal_failure", "reservation_rejected");
    }
    callId = reservation.data;
  }
  await persistStage(
    run,
    "reserve_budget",
    3,
    "succeeded",
    `ai_calls:${callId}`,
  );
  await persistStage(run, "invoke_ai", 4, "running", `ai_calls:${callId}`);

  const apiKey = Deno.env.get("OPENAI_API_KEY")!;
  let response: Record<string, unknown> | null = null;
  try {
    const providerResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "idempotency-key": requestId,
        },
        body: JSON.stringify({
          model: selectedModel,
          reasoning: { effort: definitionConfig.default_reasoning },
          instructions:
            `${promptVersionResult.data.system_text}\n\n${promptVersionResult.data.developer_text}`,
          input: workflowInput,
          background: true,
          max_output_tokens: 2_000,
          store: false,
          tools: [],
          text: {
            format: {
              type: "json_schema",
              name: "ai_operations_report",
              strict: true,
              schema: reportOutputSchema,
            },
          },
        }),
      },
    );
    const decoded: unknown = await providerResponse.json().catch(() => null);
    if (providerResponse.ok && isRecord(decoded)) response = decoded;
  } catch {
    // The queue owner applies bounded retry/backoff after this typed failure.
  }
  if (!response || typeof response.id !== "string") {
    await persistStage(
      run,
      "invoke_ai",
      4,
      "failed",
      `ai_calls:${callId}`,
      "provider_failed",
    );
    await service.rpc("settle_instrumented_ai_call", {
      p_call_id: callId,
      p_actual_cost: 0,
      p_input_tokens: 0,
      p_output_tokens: 0,
      p_cached_input_tokens: 0,
      p_reasoning_tokens: 0,
      p_search_calls: 0,
      p_provider_usage: {},
      p_redacted_trace: {
        workflow: definition.code,
        provider_result: "failed_or_incomplete",
      },
      p_validation_passed: false,
    });
    return outcomeFor(run.id, "retryable_failure", "provider_failed");
  }
  const submitted = await service.rpc("mark_instrumented_ai_call_submitted", {
    p_call_id: callId,
    p_response_id: response.id,
  });
  if (submitted.error) {
    return outcomeFor(run.id, "retryable_failure", "submission_record_failed");
  }
  const queueState = await submitProviderResponse(run.id, response.id);
  if (queueState?.status === "succeeded") {
    const success = await successOutcomeForExistingReport(run.id);
    if (success) return success;
  }
  if (queueState?.status === "dead_letter") {
    return outcomeFor(run.id, "terminal_failure", "provider_response_timeout");
  }
  if (queueState?.status !== "awaiting_provider") {
    return outcomeFor(
      run.id,
      "retryable_failure",
      "provider_queue_submission_failed",
    );
  }
  await persistStage(run, "invoke_ai", 4, "succeeded", `ai_calls:${callId}`);
  await persistStage(
    run,
    "awaiting_provider",
    5,
    "running",
    `responses:${response.id}`,
  );
  return { runId: run.id, outcome: "submitted", responseId: response.id };
}

async function executeCanonicalRun(
  runId: string,
): Promise<ExecuteWorkflowOutcome> {
  try {
    const execution = await loadTrustedWorkflowExecution(
      runId,
      executionSource(),
    );
    const mode = resolveWorkflowMode(
      execution.run.managerCode,
      execution.definition.code,
    );
    if (!mode) {
      return outcomeFor(
        runId,
        "terminal_failure",
        "workflow_capability_missing",
      );
    }
    if (mode === "deterministic") return await executeDeterministic(runId);
    return await executeAiWorkflow(execution);
  } catch (error) {
    if (
      error instanceof Error && error.message === "workflow_run_not_executable"
    ) {
      return outcomeFor(
        runId,
        "terminal_failure",
        "workflow_run_not_executable",
      );
    }
    return outcomeFor(runId, "retryable_failure", "workflow_execution_failed");
  }
}

Deno.serve(
  createWorkflowExecutionHandler({
    workerSecret: Deno.env.get("WORKER_SECRET") ?? "",
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    execute: executeCanonicalRun,
    timingSafeEqual,
  }),
);
