import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { verifyOpenAiWebhookSignature } from "../_shared/openai-webhook-security.ts";
import {
  extractResponseOutputText,
  redactedProviderUsage,
  validateReportOutput,
} from "../_shared/openai-contract.ts";

const service = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const sha256 = async (value: string) => {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(
    new Uint8Array(bytes),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
};

async function recordEvent(externalId: string): Promise<string | null> {
  const inserted = await service.from("webhook_events").insert({
    provider: "openai",
    external_id: externalId,
    signature_verified: true,
    status: "received",
  }).select("id").maybeSingle();
  if (!inserted.error) return inserted.data?.id ?? null;
  if (inserted.error.code !== "23505") return null;
  const existing = await service.from("webhook_events").select("id").eq(
    "provider",
    "openai",
  )
    .eq("external_id", externalId).maybeSingle();
  return existing.data?.id ?? null;
}

async function resolveProviderJob(
  runId: string,
  responseId: string,
): Promise<{ id: string; status: string } | null> {
  const submission = await service.rpc("submit_workflow_job_response", {
    p_run_id: runId,
    p_response_id: responseId,
  });
  if (
    submission.error || !isRecord(submission.data) ||
    typeof submission.data.id !== "string" ||
    typeof submission.data.status !== "string"
  ) return null;
  return { id: submission.data.id, status: submission.data.status };
}

async function failProviderResult(
  jobId: string,
  responseId: string,
  callId: string,
  errorCode: string,
  actualCost: number,
  usage: Record<string, number>,
  trace: Record<string, unknown>,
): Promise<boolean> {
  const failure = await service.rpc("fail_instrumented_ai_provider_response", {
    p_job_id: jobId,
    p_response_id: responseId,
    p_call_id: callId,
    p_error_code: errorCode,
    p_actual_cost: actualCost,
    p_input_tokens: usage.input_tokens,
    p_output_tokens: usage.output_tokens,
    p_cached_input_tokens: usage.cached_input_tokens,
    p_reasoning_tokens: usage.reasoning_tokens,
    p_provider_usage: usage,
    p_redacted_trace: trace,
  });
  return !failure.error && failure.data === true;
}

async function markEvent(
  eventId: string | null,
  status: "processed" | "retrying",
): Promise<void> {
  if (!eventId) return;
  await service.from("webhook_events").update({ status }).eq("id", eventId);
}

Deno.serve(async (request) => {
  const payload = await request.text();
  if (
    !(await verifyOpenAiWebhookSignature(
      payload,
      request.headers,
      Deno.env.get("OPENAI_WEBHOOK_SECRET"),
    ))
  ) {
    return json({ code: "invalid_signature" }, 401);
  }
  let body: { id?: string; type?: string; data?: { id?: string } };
  try {
    body = JSON.parse(payload) as {
      id?: string;
      type?: string;
      data?: { id?: string };
    };
  } catch {
    return json({ code: "invalid_event" }, 400);
  }
  if (!body.id || !body.type) return json({ code: "invalid_event" }, 400);
  const eventId = await recordEvent(body.id);
  if (!eventId) return json({ code: "event_store_failed" }, 500);
  if (
    !["response.completed", "response.failed", "response.incomplete"].includes(
      body.type,
    ) || !body.data?.id
  ) {
    await markEvent(eventId, "processed");
    return json({ accepted: true });
  }

  const responseId = body.data.id;
  const call = await service.from("ai_calls").select(
    "id,run_id,user_id,model_id,estimated_cost,request_id,redacted_trace,status",
  ).eq("response_id", responseId).maybeSingle();
  if (call.error) return json({ code: "response_lookup_failed" }, 500);
  if (!call.data?.run_id) {
    await markEvent(eventId, "processed");
    return json({ accepted: true, ignored: true });
  }
  const callData = call.data;
  if (callData.status === "succeeded") {
    await markEvent(eventId, "processed");
    return json({ accepted: true, duplicate: true });
  }
  const trace = isRecord(callData.redacted_trace)
    ? callData.redacted_trace
    : {};
  const evidenceIds = Array.isArray(trace.evidence_ids)
    ? trace.evidence_ids.filter((id): id is string => typeof id === "string")
    : [];
  const allowedActionTypes = Array.isArray(trace.allowed_action_types)
    ? trace.allowed_action_types.filter((action): action is string =>
      typeof action === "string"
    )
    : [];

  if (["failed", "cancelled"].includes(callData.status)) {
    if (trace.response_id !== responseId || trace.validation_passed !== false) {
      return json({ code: "response_not_reconcilable" }, 409);
    }
    await markEvent(eventId, "processed");
    return json({ accepted: true, duplicate: true, reconciliation: "failed" });
  }
  if (
    !["submitted", "completed_pending_reconciliation", "reconciliation_failed"]
      .includes(callData.status)
  ) {
    return json({ code: "response_not_reconcilable" }, 409);
  }
  const providerJob = await resolveProviderJob(callData.run_id, responseId);
  if (!providerJob) {
    await markEvent(eventId, "retrying");
    return json({ code: "provider_queue_lookup_retry_required" }, 500);
  }
  if (providerJob.status === "dead_letter") {
    await markEvent(eventId, "processed");
    return json({ accepted: true, expired: true });
  }
  if (providerJob.status === "succeeded") {
    await markEvent(eventId, "processed");
    return json({ accepted: true, duplicate: true });
  }
  if (providerJob.status !== "awaiting_provider") {
    await markEvent(eventId, "retrying");
    return json({ code: "provider_queue_not_awaiting" }, 500);
  }

  const responseResult = await fetch(
    `https://api.openai.com/v1/responses/${encodeURIComponent(responseId)}`,
    {
      headers: {
        authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY") ?? ""}`,
      },
    },
  ).then(async (result) => result.ok ? await result.json() : null).catch(() =>
    null
  );
  if (
    isRecord(responseResult) &&
    ["failed", "incomplete"].includes(String(responseResult.status))
  ) {
    const failedUsage = redactedProviderUsage(responseResult);
    const failedCostResult = await service.rpc(
      "calculate_instrumented_ai_cost",
      {
        p_model_id: callData.model_id,
        p_input_tokens: failedUsage.input_tokens,
        p_output_tokens: failedUsage.output_tokens,
        p_cached_input_tokens: failedUsage.cached_input_tokens,
        p_search_calls: 0,
      },
    );
    if (failedCostResult.error || typeof failedCostResult.data !== "number") {
      await markEvent(eventId, "retrying");
      return json({ code: "provider_failure_cost_retry_required" }, 500);
    }
    const failedTrace = {
      request_id: callData.request_id,
      response_id: responseId,
      provider_status: responseResult.status,
      response_sha256: null,
      background: true,
      validation_passed: false,
    };
    const settled = await failProviderResult(
      providerJob.id,
      responseId,
      callData.id,
      responseResult.status === "failed"
        ? "provider_response_failed"
        : "provider_response_incomplete",
      Math.min(callData.estimated_cost, failedCostResult.data),
      failedUsage,
      failedTrace,
    );
    if (!settled) {
      await markEvent(eventId, "retrying");
      return json({ code: "provider_failure_settlement_retry_required" }, 500);
    }
    await markEvent(eventId, "processed");
    return json({ accepted: true, reconciliation: "failed" });
  }
  if (!isRecord(responseResult) || responseResult.status !== "completed") {
    await service.rpc("record_instrumented_ai_reconciliation_failure", {
      p_call_id: callData.id,
      p_error_code: "provider_response_unavailable",
      p_redacted_trace: { response_id: responseId },
    });
    await markEvent(eventId, "retrying");
    return json({ code: "reconciliation_retry_required" }, 500);
  }

  const outputText = extractResponseOutputText(responseResult);
  let parsed: unknown = null;
  try {
    parsed = outputText ? JSON.parse(outputText) : null;
  } catch { /* invalid output is settled below */ }
  const validated = validateReportOutput(parsed, new Set(evidenceIds));
  const actionsAllowed = validated?.actions.every((action) =>
    allowedActionTypes.includes(action.type)
  ) ?? false;
  const usage = redactedProviderUsage(responseResult);
  const actualCost = await service.rpc("calculate_instrumented_ai_cost", {
    p_model_id: callData.model_id,
    p_input_tokens: usage.input_tokens,
    p_output_tokens: usage.output_tokens,
    p_cached_input_tokens: usage.cached_input_tokens,
    p_search_calls: 0,
  });
  if (actualCost.error || typeof actualCost.data !== "number") {
    await service.rpc("record_instrumented_ai_reconciliation_failure", {
      p_call_id: callData.id,
      p_error_code: "provider_usage_reconciliation_failed",
      p_redacted_trace: { response_id: responseId },
    });
    await markEvent(eventId, "retrying");
    return json({ code: "reconciliation_retry_required" }, 500);
  }
  if (actualCost.data > callData.estimated_cost) {
    const settled = await failProviderResult(
      providerJob.id,
      responseId,
      callData.id,
      "provider_usage_exceeded_reservation",
      callData.estimated_cost,
      usage,
      {
        request_id: callData.request_id,
        response_id: responseId,
        response_sha256: outputText ? await sha256(outputText) : null,
        actual_cost: actualCost.data,
        validation_passed: false,
        budget_discrepancy: "actual_cost_exceeded_reservation",
      },
    );
    if (!settled) {
      await markEvent(eventId, "retrying");
      return json({ code: "usage_excess_settlement_retry_required" }, 500);
    }
    await markEvent(eventId, "processed");
    return json({ accepted: true, reconciliation: "failed" });
  }
  if (!validated || !actionsAllowed) {
    const validationErrorCode = validated
      ? "workflow_action_capability_missing"
      : "structured_output_invalid";
    const settled = await failProviderResult(
      providerJob.id,
      responseId,
      callData.id,
      validationErrorCode,
      actualCost.data,
      usage,
      {
        request_id: callData.request_id,
        response_id: responseId,
        response_sha256: outputText ? await sha256(outputText) : null,
        validation_passed: false,
        validation_error_code: validationErrorCode,
        background: true,
      },
    );
    if (!settled) {
      await markEvent(eventId, "retrying");
      return json({ code: "provider_failure_settlement_retry_required" }, 500);
    }
    await markEvent(eventId, "processed");
    return json({ accepted: true, reconciliation: "failed" });
  }

  const run = await service.from("workflow_runs").select("correlation_id").eq(
    "id",
    callData.run_id,
  ).maybeSingle();
  if (run.error || !run.data) {
    await markEvent(eventId, "retrying");
    return json({ code: "run_context_unavailable" }, 500);
  }
  const sections = validated.report_sections.map((section, index) => ({
    code: section.code,
    title: section.title,
    display_order: index,
    content: section.content,
    structured_data: { findings: validated.findings },
    evidence_references: validated.evidence,
  }));
  const committed = await service.rpc(
    "commit_instrumented_ai_report_with_queue",
    {
      p_job_id: providerJob.id,
      p_response_id: responseId,
      p_call_id: callData.id,
      p_report_type: typeof trace.workflow === "string"
        ? trace.workflow
        : "background-ai-report",
      p_notification_policy: trace.notification_policy,
      p_title: "Validated AI Operations report",
      p_summary: validated.summary,
      p_markdown: `## Validated AI Operations report\n\n${validated.summary}`,
      p_structured_metrics: {
        ai_call_id: callData.id,
        response_id: responseId,
        validation: "passed",
        evidence_ids: evidenceIds,
        notification_policy: trace.notification_policy,
        actual_cost: actualCost.data,
      },
      p_sections: sections,
      p_actions: validated.actions.map((action) => ({
        action_type: action.type,
        title: action.title,
        risk_class: action.risk,
      })),
      p_actual_cost: actualCost.data,
      p_input_tokens: usage.input_tokens,
      p_output_tokens: usage.output_tokens,
      p_cached_input_tokens: usage.cached_input_tokens,
      p_reasoning_tokens: usage.reasoning_tokens,
      p_provider_usage: usage,
      p_redacted_trace: {
        request_id: callData.request_id,
        response_id: responseId,
        response_sha256: outputText ? await sha256(outputText) : null,
        validation_passed: true,
        background: true,
        web_search: false,
      },
    },
  );
  if (committed.error) {
    await markEvent(eventId, "retrying");
    return json({ code: "report_commit_retry_required" }, 500);
  }
  if (typeof committed.data !== "string") {
    await markEvent(eventId, "processed");
    return json({ accepted: true, expired: true });
  }
  await markEvent(eventId, "processed");
  return json({ accepted: true, reportId: committed.data });
});
