import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import {
  redactedProviderUsage,
  reportOutputSchema,
  validateReportOutput,
} from "../_shared/openai-contract.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const service = createClient(
  url,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value);
const isRequestId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9._:-]{8,200}$/.test(value);
const safeText = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const isRetryable = (status: number) =>
  status === 408 || status === 409 || status === 429 || status >= 500;
const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};
const isAuthorisedInternal = (request: Request) => {
  const workerSecret = Deno.env.get("WORKER_SECRET") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const workerAuthorised = workerSecret.length > 0 &&
    timingSafeEqual(request.headers.get("x-worker-secret") ?? "", workerSecret);
  const serviceAuthorised = serviceKey.length > 0 &&
    timingSafeEqual(
      request.headers.get("authorization") ?? "",
      `Bearer ${serviceKey}`,
    );
  return workerAuthorised || serviceAuthorised;
};

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(
    new Uint8Array(bytes),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

type ExecutionRequest = Readonly<{
  runId: string;
  promptCode: string;
  model: "gpt-5.6-luna" | "gpt-5.6-terra" | "gpt-5.6-sol";
  input: string;
  evidence: ReadonlyArray<Readonly<{ id: string; source: string }>>;
  estimatedCost: number;
  requestId: string;
  maxAttempts: number;
}>;

function parseRequest(value: unknown): ExecutionRequest | null {
  if (
    !isRecord(value) || !isUuid(value.runId) ||
    !safeText(value.promptCode, 100) ||
    !["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"].includes(
      String(value.model),
    ) ||
    !safeText(value.input, 24_000) || !Number.isFinite(value.estimatedCost) ||
    (value.estimatedCost as number) < 0 ||
    (value.estimatedCost as number) > 2 ||
    !isRequestId(value.requestId) || !Number.isInteger(value.maxAttempts) ||
    (value.maxAttempts as number) < 1 || (value.maxAttempts as number) > 2 ||
    !Array.isArray(value.evidence) ||
    value.evidence.length < 1 || value.evidence.length > 50
  ) return null;
  const evidence = value.evidence.map((item) => {
    if (
      !isRecord(item) || !safeText(item.id, 200) || !safeText(item.source, 500)
    ) return null;
    return { id: item.id, source: item.source };
  });
  if (evidence.some((item) => item === null)) return null;
  return {
    runId: value.runId,
    promptCode: value.promptCode,
    model: value.model as ExecutionRequest["model"],
    input: value.input,
    evidence: evidence as Array<{ id: string; source: string }>,
    estimatedCost: value.estimatedCost as number,
    requestId: value.requestId,
    maxAttempts: value.maxAttempts as number,
  };
}

async function providerResponse(
  request: ExecutionRequest,
  instructions: string,
): Promise<Record<string, unknown> | null> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return null;
  let lastStatus = 0;
  for (let attempt = 1; attempt <= request.maxAttempts; attempt += 1) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "idempotency-key": request.requestId,
        },
        body: JSON.stringify({
          model: request.model,
          instructions,
          input: request.input,
          background: false,
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
      });
      lastStatus = response.status;
      const body: unknown = await response.json().catch(() => null);
      if (response.ok && isRecord(body)) return body;
      if (!isRetryable(response.status)) break;
    } catch {
      lastStatus = 599;
    }
  }
  return lastStatus === 0 ? null : null;
}

Deno.serve(async (request) => {
  if (
    request.method !== "POST" ||
    !isAuthorisedInternal(request)
  ) return json({ code: "unauthorised" }, 401);
  const body = parseRequest(await request.json().catch(() => null));
  if (!body) return json({ code: "invalid_request" }, 400);
  const [runResult, modelResult, promptResult] = await Promise.all([
    service.from("workflow_runs").select("id,user_id,correlation_id,status").eq(
      "id",
      body.runId,
    ).in("status", ["queued", "running"]).maybeSingle(),
    service.from("ai_model_catalog").select("id,model_id,enabled").eq(
      "model_id",
      body.model,
    ).eq("enabled", true).maybeSingle(),
    service.from("prompt_templates").select("id,active_version").eq(
      "code",
      body.promptCode,
    ).maybeSingle(),
  ]);
  if (runResult.error || !runResult.data) {
    return json({ code: "run_not_executable" }, 422);
  }
  if (modelResult.error || !modelResult.data) {
    return json({ code: "model_unavailable" }, 422);
  }
  if (promptResult.error || !promptResult.data?.active_version) {
    return json({ code: "prompt_unavailable" }, 422);
  }
  const run = runResult.data;
  const promptVersion = await service.from("prompt_versions").select(
    "id,system_text,developer_text",
  ).eq("template_id", promptResult.data.id).eq(
    "version",
    promptResult.data.active_version,
  ).maybeSingle();
  if (promptVersion.error || !promptVersion.data) {
    return json({ code: "prompt_version_unavailable" }, 422);
  }
  const reserve = await service.rpc("reserve_instrumented_ai_call", {
    p_user_id: run.user_id,
    p_run_id: body.runId,
    p_model_id: modelResult.data.id,
    p_prompt_version_id: promptVersion.data.id,
    p_estimated_cost: body.estimatedCost,
    p_request_id: body.requestId,
    p_redacted_trace: {
      request_id: body.requestId,
      model: body.model,
      prompt_code: body.promptCode,
      background: false,
      web_search: false,
      evidence_ids: body.evidence.map((item) => item.id),
      max_attempts: body.maxAttempts,
    },
  });
  if (reserve.error || !reserve.data) {
    return json({ code: "reservation_rejected" }, 422);
  }
  const callId = reserve.data as string;
  const response = await providerResponse(
    body,
    `${promptVersion.data.system_text}\n\n${promptVersion.data.developer_text}`,
  );
  if (
    !response || !safeText(response.id, 300) ||
    !safeText(response.output_text, 60_000)
  ) {
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
        request_id: body.requestId,
        provider_result: "failed_or_incomplete",
      },
      p_validation_passed: false,
    });
    await service.from("workflow_runs").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_code: "ai_provider_failed",
      redacted_error: "AI provider failed or returned an incomplete response.",
    }).eq("id", body.runId);
    return json({ code: "provider_failed" }, 502);
  }
  const submitted = await service.rpc("mark_instrumented_ai_call_submitted", {
    p_call_id: callId,
    p_response_id: response.id,
  });
  if (submitted.error) return json({ code: "submission_record_failed" }, 500);
  let output: unknown = null;
  try {
    output = JSON.parse(response.output_text);
  } catch { /* settled below as invalid */ }
  const validated = validateReportOutput(
    output,
    new Set(body.evidence.map((item) => item.id)),
  );
  const usage = redactedProviderUsage(response);
  const cost = await service.rpc("calculate_instrumented_ai_cost", {
    p_model_id: modelResult.data.id,
    p_input_tokens: usage.input_tokens,
    p_output_tokens: usage.output_tokens,
    p_cached_input_tokens: usage.cached_input_tokens,
    p_search_calls: 0,
  });
  if (
    cost.error || typeof cost.data !== "number" ||
    cost.data > body.estimatedCost
  ) return json({ code: "usage_reconciliation_failed" }, 409);
  const settled = await service.rpc("settle_instrumented_ai_call", {
    p_call_id: callId,
    p_actual_cost: cost.data,
    p_input_tokens: usage.input_tokens,
    p_output_tokens: usage.output_tokens,
    p_cached_input_tokens: usage.cached_input_tokens,
    p_reasoning_tokens: usage.reasoning_tokens,
    p_search_calls: 0,
    p_provider_usage: usage,
    p_redacted_trace: {
      request_id: body.requestId,
      response_id: response.id,
      response_sha256: await sha256(response.output_text),
      model: body.model,
      validation_passed: validated !== null,
      background: false,
      web_search: false,
    },
    p_validation_passed: validated !== null,
  });
  if (settled.error || !validated) {
    await service.from("workflow_runs").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_code: "ai_output_invalid",
      redacted_error:
        "AI response did not satisfy the persisted structured-output contract.",
    }).eq("id", body.runId);
    return json({ code: "structured_output_invalid" }, 422);
  }
  const report = await service.from("reports").insert({
    user_id: run.user_id,
    run_id: body.runId,
    report_type: body.promptCode,
    title: "Validated AI Operations report",
    summary: validated.summary,
    markdown: `## Validated AI Operations report\n\n${validated.summary}`,
    structured_metrics: {
      ai_call_id: callId,
      response_id: response.id,
      validation: "passed",
      evidence_ids: body.evidence.map((item) => item.id),
    },
    status: "validated",
  }).select("id").single();
  if (report.error || !report.data) {
    return json({ code: "report_store_failed" }, 500);
  }
  const sections = validated.report_sections.map((section, index) => ({
    report_id: report.data.id,
    code: section.code,
    title: section.title,
    display_order: index,
    content: section.content,
    structured_data: { findings: validated.findings },
    evidence_references: validated.evidence,
  }));
  const sectionResult = await service.from("report_sections").insert(sections);
  if (sectionResult.error) {
    return json({ code: "report_sections_store_failed" }, 500);
  }
  if (validated.actions.length > 0) {
    const actions = await service.from("actions").insert(
      validated.actions.map((action) => ({
        user_id: run.user_id,
        run_id: body.runId,
        action_type: action.type,
        title: action.title,
        description:
          "AI-proposed action; explicit approval is required before execution.",
        risk_class: action.risk,
        status: "proposed",
        proposed_payload: {
          source: "validated_ai_output",
          response_id: response.id,
        },
      })),
    );
    if (actions.error) return json({ code: "actions_store_failed" }, 500);
  }
  await service.from("workflow_runs").update({
    status: "succeeded",
    completed_at: new Date().toISOString(),
  }).eq("id", body.runId);
  await service.from("trace_events").insert({
    user_id: run.user_id,
    correlation_id: run.correlation_id,
    event_type: "ai_report_validated",
    redacted_payload: {
      call_id: callId,
      report_id: report.data.id,
      response_id: response.id,
      validation: "passed",
    },
  });
  return json({ callId, reportId: report.data.id });
});
