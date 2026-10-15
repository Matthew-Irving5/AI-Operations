import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { getAal2Identity } from "../_shared/auth-assurance.ts";
import { consumeRateLimit } from "../_shared/rate-limit.ts";
import {
  evaluatePromptCandidate,
  validatePromptGovernance,
  validateReportOutputSchema,
} from "../../../packages/ai-runtime/src/governance.ts";
import { buildCurrentPromptResponse } from "./current.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const service = createClient(
  url,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const allowedEmail = "matthewirving99@gmail.com";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ code: "method_not_allowed" }, 405);
  }
  const authorization = request.headers.get("authorization") ?? "";
  const jwt = authorization.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
  const identity = await getAal2Identity(
    jwt,
    (token) => service.auth.getUser(token),
  );
  if (!identity.user) return json({ code: "aal2_required" }, 403);
  if (identity.user.email?.toLowerCase() !== allowedEmail) {
    return json({ code: "forbidden" }, 403);
  }
  if (!(await consumeRateLimit(identity.user.id, "prompt_governance", 12))) {
    return json({ code: "rate_limited" }, 429);
  }
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || typeof body.operation !== "string") {
    return json({ code: "invalid_request" }, 400);
  }
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 100_000) {
    return json({ code: "request_too_large" }, 413);
  }
  if (body.operation === "create_candidate") {
    return await createCandidate(body);
  }
  if (body.operation === "get_current") return await getCurrent();
  if (body.operation === "evaluate") return await evaluateCandidate(body);
  if (body.operation === "promote" || body.operation === "rollback") {
    return await transition(body, identity.user.id);
  }
  return json({ code: "invalid_operation" }, 400);
});

async function getCurrent() {
  const templateResult = await service
    .from("prompt_templates")
    .select("id,code,active_version,managers!inner(code)")
    .eq("code", "controlled-agent-report")
    .eq("managers.code", "systems")
    .maybeSingle();
  if (templateResult.error) {
    return json({ code: "prompt_template_lookup_failed" }, 500);
  }
  if (!templateResult.data) {
    return json({ code: "prompt_template_not_found" }, 404);
  }

  const activeVersion = templateResult.data.active_version;
  if (!Number.isSafeInteger(activeVersion)) {
    return json({ code: "active_prompt_version_invalid" }, 500);
  }
  const versionResult = await service
    .from("prompt_versions")
    .select(
      "template_id,version,json_schema,model_route,schema_version,tool_policy_version,tool_policy",
    )
    .eq("template_id", templateResult.data.id)
    .eq("version", activeVersion)
    .maybeSingle();
  if (versionResult.error || !versionResult.data) {
    return json({ code: "active_prompt_version_lookup_failed" }, 500);
  }

  const relation = Array.isArray(templateResult.data.managers)
    ? templateResult.data.managers[0]
    : templateResult.data.managers;
  const current = buildCurrentPromptResponse({
    ...templateResult.data,
    managerCode: isRecord(relation) ? relation.code : null,
  }, versionResult.data);
  return current
    ? json(current)
    : json({ code: "active_prompt_governance_invalid" }, 500);
}

async function loadSystemsTemplate(templateId: unknown) {
  if (typeof templateId !== "string" || !/^[0-9a-f-]{36}$/i.test(templateId)) {
    return null;
  }
  const result = await service
    .from("prompt_templates")
    .select("id,active_version,manager_id,managers!inner(code)")
    .eq("id", templateId)
    .maybeSingle();
  if (result.error || !result.data) return null;
  const manager = Array.isArray(result.data.managers)
    ? result.data.managers[0]
    : result.data.managers;
  return isRecord(manager) && manager.code === "systems" ? result.data : null;
}

async function createCandidate(body: Record<string, unknown>) {
  const template = await loadSystemsTemplate(body.templateId);
  if (!template) return json({ code: "prompt_template_not_found" }, 404);
  if (
    typeof body.systemText !== "string" ||
    !body.systemText.trim() ||
    body.systemText.length > 20_000 ||
    typeof body.developerText !== "string" ||
    !body.developerText.trim() ||
    body.developerText.length > 20_000 ||
    !validateReportOutputSchema(body.schema)
  ) {
    return json({ code: "invalid_prompt_candidate" }, 400);
  }
  const candidateGovernance = {
    modelRoute: body.modelRoute,
    schemaVersion: body.schemaVersion,
    toolPolicyVersion: body.toolPolicyVersion,
    toolPolicy: body.toolPolicy,
  };
  if (
    !validatePromptGovernance(candidateGovernance) ||
    candidateGovernance.toolPolicy.tools.length !== 0
  ) {
    return json({ code: "prompt_governance_invalid" }, 400);
  }
  const lastVersion = await service
    .from("prompt_versions")
    .select("version")
    .eq("template_id", template.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastVersion.error) {
    return json({ code: "prompt_version_lookup_failed" }, 500);
  }
  const nextVersion = (lastVersion.data?.version ?? 0) + 1;
  const inserted = await service
    .from("prompt_versions")
    .insert({
      template_id: template.id,
      version: nextVersion,
      system_text: body.systemText,
      developer_text: body.developerText,
      json_schema: body.schema,
      evaluation_status: "draft",
      model_route: candidateGovernance.modelRoute,
      schema_version: candidateGovernance.schemaVersion,
      tool_policy_version: candidateGovernance.toolPolicyVersion,
      tool_policy: candidateGovernance.toolPolicy,
    })
    .select("id,version")
    .single();
  if (inserted.error) {
    return json({ code: "prompt_candidate_store_failed" }, 500);
  }
  return json(
    { candidateId: inserted.data.id, version: inserted.data.version },
    201,
  );
}

async function evaluateCandidate(body: Record<string, unknown>) {
  if (
    typeof body.candidateId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(body.candidateId)
  ) {
    return json({ code: "invalid_candidate_id" }, 400);
  }
  const result = await service
    .from("prompt_versions")
    .select(
      "id,template_id,system_text,developer_text,json_schema,model_route,schema_version,tool_policy_version,tool_policy,evaluation_status",
    )
    .eq("id", body.candidateId)
    .maybeSingle();
  if (
    result.error || !result.data || result.data.evaluation_status !== "draft"
  ) {
    return json({ code: "prompt_candidate_not_evaluable" }, 409);
  }
  if (!(await loadSystemsTemplate(result.data.template_id))) {
    return json({ code: "prompt_template_not_found" }, 404);
  }
  const governance = {
    modelRoute: result.data.model_route,
    schemaVersion: result.data.schema_version,
    toolPolicyVersion: result.data.tool_policy_version,
    toolPolicy: result.data.tool_policy,
  };
  const validGovernance = validatePromptGovernance(governance);
  const evaluation = evaluatePromptCandidate({
    systemText: result.data.system_text,
    developerText: result.data.developer_text,
    schema: result.data.json_schema,
    modelRoute: result.data.model_route,
    toolPolicy: result.data.tool_policy,
  });
  const finalEvaluation = validGovernance
    ? evaluation
    : { ...evaluation, passed: false, toolAuthorityPassed: false };
  const stored = await service.rpc("record_prompt_evaluation", {
    p_prompt_version_id: result.data.id,
    p_evaluation_result: finalEvaluation,
  });
  if (stored.error) {
    return json({ code: "prompt_evaluation_store_failed" }, 500);
  }
  return json(
    { candidateId: result.data.id, evaluation: finalEvaluation },
    finalEvaluation.passed ? 200 : 422,
  );
}

async function transition(body: Record<string, unknown>, actorUserId: string) {
  if (
    typeof body.templateId !== "string" ||
    !Number.isSafeInteger(body.targetVersion) ||
    !Number.isSafeInteger(body.expectedActiveVersion) ||
    typeof body.idempotencyKey !== "string" ||
    !/^[A-Za-z0-9._:-]{8,200}$/.test(body.idempotencyKey)
  ) {
    return json({ code: "invalid_prompt_transition" }, 400);
  }
  const template = await loadSystemsTemplate(body.templateId);
  if (!template) return json({ code: "prompt_template_not_found" }, 404);
  const result = await service.rpc("transition_prompt_version", {
    p_template_id: template.id,
    p_target_version: body.targetVersion,
    p_expected_active_version: body.expectedActiveVersion,
    p_actor_user_id: actorUserId,
    p_operation: body.operation,
    p_idempotency_key: body.idempotencyKey,
  });
  if (result.error) {
    const conflict = result.error.message.includes("conflict") ||
      result.error.message.includes("gate_failed") ||
      result.error.message.includes("already_active");
    return json(
      {
        code: conflict
          ? "prompt_transition_rejected"
          : "prompt_transition_failed",
      },
      conflict ? 409 : 500,
    );
  }
  return json(result.data);
}
