import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
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

Deno.serve(async (request) => {
  const payload = await request.text();
  if (
    !(await verifyOpenAiWebhookSignature(
      payload,
      request.headers,
      Deno.env.get("OPENAI_WEBHOOK_SECRET"),
    ))
  ) return json({ code: "invalid_signature" }, 401);
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
  const event = await service.from("webhook_events").insert({
    provider: "openai",
    external_id: body.id,
    signature_verified: true,
    status: "received",
  }).select("id").maybeSingle();
  if (event.error?.code === "23505") return json({ duplicate: true });
  if (event.error) return json({ code: "event_store_failed" }, 500);
  if (body.type === "response.completed" && body.data?.id) {
    const call = await service.from("ai_calls").select(
      "id,run_id,user_id,model_id,estimated_cost,request_id,redacted_trace",
    ).eq("response_id", body.data.id).maybeSingle();
    if (call.error) return json({ code: "response_lookup_failed" }, 500);
    if (call.data?.run_id) {
      const callData = call.data;
      const completedResponseId = body.data.id;
      const updated = await service.from("ai_calls").update({
        // A completion notification has no validated response body or usage.
        // Keep the call pending until the server-side reconciliation path has
        // retrieved, schema-validated, costed, and traced that response.
        status: "completed_pending_reconciliation",
      }).eq(
        "response_id",
        body.data.id,
      );
      if (updated.error) return json({ code: "response_update_failed" }, 500);
      const run = await service.from("workflow_runs").select(
        "correlation_id",
      ).eq("id", call.data.run_id).maybeSingle();
      await service.from("trace_events").insert({
        user_id: call.data.user_id,
        correlation_id: run.data?.correlation_id ?? crypto.randomUUID(),
        event_type: "background_response_completed",
        redacted_payload: {
          response_id: body.data.id,
          reconciliation_required: true,
        },
      });
      const response = await fetch(
        `https://api.openai.com/v1/responses/${
          encodeURIComponent(body.data.id)
        }`,
        {
          headers: {
            authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY") ?? ""}`,
          },
        },
      ).then(async (result) => result.ok ? await result.json() : null).catch(
        () => null,
      );
      if (!isRecord(response)) {
        return json({ accepted: true, reconciliation: "pending" });
      }
      const outputText = extractResponseOutputText(response);
      const trace = isRecord(call.data.redacted_trace)
        ? call.data.redacted_trace
        : {};
      const evidenceIds = Array.isArray(trace.evidence_ids)
        ? trace.evidence_ids.filter((id): id is string =>
          typeof id === "string"
        )
        : [];
      let parsed: unknown = null;
      try {
        parsed = outputText ? JSON.parse(outputText) : null;
      } catch { /* settled invalid below */ }
      const validated = validateReportOutput(parsed, new Set(evidenceIds));
      const usage = redactedProviderUsage(response);
      const cost = await service.rpc("calculate_instrumented_ai_cost", {
        p_model_id: call.data.model_id,
        p_input_tokens: usage.input_tokens,
        p_output_tokens: usage.output_tokens,
        p_cached_input_tokens: usage.cached_input_tokens,
        p_search_calls: 0,
      });
      if (
        cost.error || typeof cost.data !== "number" ||
        cost.data > call.data.estimated_cost
      ) {
        return json({ accepted: true, reconciliation: "cost_pending" });
      }
      const settled = await service.rpc("settle_instrumented_ai_call", {
        p_call_id: call.data.id,
        p_actual_cost: cost.data,
        p_input_tokens: usage.input_tokens,
        p_output_tokens: usage.output_tokens,
        p_cached_input_tokens: usage.cached_input_tokens,
        p_reasoning_tokens: usage.reasoning_tokens,
        p_search_calls: 0,
        p_provider_usage: usage,
        p_redacted_trace: {
          request_id: call.data.request_id,
          response_id: body.data.id,
          response_sha256: outputText ? await sha256(outputText) : null,
          validation_passed: validated !== null,
          background: true,
          web_search: false,
        },
        p_validation_passed: validated !== null,
      });
      if (settled.error || !validated) {
        await service.from("workflow_runs").update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_code: "background_ai_output_invalid",
          redacted_error:
            "Background response failed structured-output validation.",
        }).eq("id", call.data.run_id);
        return json({ accepted: true, reconciliation: "failed" });
      }
      const reportType = typeof trace.prompt_code === "string"
        ? trace.prompt_code
        : "background-ai-report";
      const report = await service.from("reports").insert({
        user_id: call.data.user_id,
        run_id: call.data.run_id,
        report_type: reportType,
        title: "Validated AI Operations report",
        summary: validated.summary,
        markdown: `## Validated AI Operations report\n\n${validated.summary}`,
        structured_metrics: {
          ai_call_id: call.data.id,
          response_id: body.data.id,
          validation: "passed",
          evidence_ids: evidenceIds,
        },
        status: "validated",
      }).select("id").single();
      if (report.error || !report.data) {
        return json({ accepted: true, reconciliation: "report_pending" });
      }
      const sections = await service.from("report_sections").insert(
        validated.report_sections.map((section, index) => ({
          report_id: report.data.id,
          code: section.code,
          title: section.title,
          display_order: index,
          content: section.content,
          structured_data: { findings: validated.findings },
          evidence_references: validated.evidence,
        })),
      );
      if (sections.error) {
        return json({ accepted: true, reconciliation: "sections_pending" });
      }
      if (validated.actions.length > 0) {
        const actions = await service.from("actions").insert(
          validated.actions.map((action) => ({
            user_id: callData.user_id,
            run_id: callData.run_id,
            action_type: action.type,
            title: action.title,
            description:
              "AI-proposed action; explicit approval is required before execution.",
            risk_class: action.risk,
            status: "proposed",
            proposed_payload: {
              source: "validated_ai_output",
              response_id: completedResponseId,
            },
          })),
        );
        if (actions.error) {
          return json({ accepted: true, reconciliation: "actions_pending" });
        }
      }
      await service.from("workflow_runs").update({
        status: "succeeded",
        completed_at: new Date().toISOString(),
      }).eq("id", call.data.run_id);
      await service.from("trace_events").insert({
        user_id: call.data.user_id,
        correlation_id: run.data?.correlation_id ?? crypto.randomUUID(),
        event_type: "background_ai_report_validated",
        redacted_payload: {
          call_id: call.data.id,
          report_id: report.data.id,
          response_id: body.data.id,
          validation: "passed",
        },
      });
    }
  }
  return json({ accepted: true });
});
