import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { z } from "npm:zod@4.1.5";
import { buildAgentRuntimeFixture } from "../../../packages/test-fixtures/src/agent-runtime.ts";
import {
  deserializeConversation,
  deserializeConversationMessage,
  serializeConversation,
  serializeConversationMessage,
} from "../../../packages/contracts/src/conversations.ts";
import type {
  Database,
  Json,
} from "../../../packages/db/src/database.types.ts";
import { getAal2Identity } from "../_shared/auth-assurance.ts";
import {
  agentRuntimeFixtureUpsertSteps,
  agentRuntimeFixtureWriteFailure,
} from "../_shared/agent-runtime-diagnostics.ts";
import { consumeRateLimit } from "../_shared/rate-limit.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const service = createClient<Database>(
  url,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  {
    auth: { autoRefreshToken: false, persistSession: false },
  },
);
const idSchema = z.string().uuid();
const operationSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("create_fixture"),
      fixtureKey: z.string().regex(/^ai14-live-e2e:[0-9a-f-]{36}$/i),
    })
    .strict(),
  z.object({ operation: z.literal("read_fixture"), conversationId: idSchema })
    .strict(),
  z
    .object({
      operation: z.literal("transition_handoff"),
      handoffId: idSchema,
      status: z.enum(["accepted", "requested"]),
    })
    .strict(),
]);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const stagingProjectHost = "jqtssfrfocnibffdkqch.supabase.co";
const localFunctionHosts = new Set(["kong", "localhost", "127.0.0.1"]);

function toJson(value: unknown): Json {
  if (
    value === null || typeof value === "string" || typeof value === "boolean"
  ) return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(toJson);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toJson(item)]),
    );
  }
  throw new Error("contract_json_value_invalid");
}

function toNonNullJson(value: unknown): NonNullable<Json> {
  const result = toJson(value);
  if (result === null) throw new Error("contract_json_value_invalid");
  return result;
}

function isAllowedRuntimeTarget(): boolean {
  try {
    const host = new URL(url).hostname;
    return host === stagingProjectHost || localFunctionHosts.has(host);
  } catch {
    return false;
  }
}

async function createFixture(userId: string, fixtureKey: string) {
  const fixture = buildAgentRuntimeFixture(userId, new Date(), fixtureKey);
  const {
    conversation,
    participants,
    message,
    handoff,
    attention,
    action,
    evidence,
    evidenceLinks,
  } = fixture;
  const { data: manager, error: managerError } = await service
    .from("managers")
    .select("id")
    .eq("code", action.managerCode)
    .single();
  if (managerError) {
    console.error(JSON.stringify(agentRuntimeFixtureWriteFailure(
      "manager_lookup",
      managerError,
      conversation.correlationId,
    )));
    return null;
  }
  if (!manager) {
    console.error(JSON.stringify({
      event: "agent_runtime_fixture_write_failed",
      step: "manager_lookup",
      table: "managers",
      reason: "manager_not_found",
      correlationId: conversation.correlationId,
    }));
    return null;
  }
  const inserts = [
    service.from("conversations").upsert(
      {
        ...serializeConversation(conversation),
        execution_state_summary: toNonNullJson(
          conversation.executionStateSummary,
        ),
        metadata: toNonNullJson(conversation.metadata),
      },
      {
        onConflict: "id",
        ignoreDuplicates: true,
      },
    ),
    service.from("conversation_participants").upsert(
      participants.map((participant) => ({
        id: participant.id,
        contract_version: participant.contractVersion,
        conversation_id: participant.conversationId,
        user_id: participant.userId,
        kind: participant.kind,
        role: participant.role,
        manager_code: participant.managerCode,
        provider_actor_id: participant.providerActorId,
        display_name: participant.displayName,
        joined_at: participant.joinedAt,
        left_at: participant.leftAt,
      })),
      { onConflict: "id", ignoreDuplicates: true },
    ),
    service.from("conversation_messages").upsert(
      serializeConversationMessage(message),
      {
        onConflict: "conversation_id,deduplication_key",
        ignoreDuplicates: true,
      },
    ),
    service.from("conversation_handoffs").upsert(
      {
        id: handoff.id,
        contract_version: handoff.contractVersion,
        conversation_id: handoff.conversationId,
        user_id: handoff.userId,
        from_manager_code: handoff.fromManagerCode,
        to_manager_code: handoff.toManagerCode,
        status: handoff.status,
        reason: handoff.reason,
        source_message_id: handoff.sourceMessageId,
        correlation_id: handoff.correlationId,
        idempotency_key: handoff.idempotencyKey,
        initiated_at: handoff.initiatedAt,
      },
      { onConflict: "id", ignoreDuplicates: true },
    ),
    service.from("attention_items").upsert(
      {
        id: attention.id,
        contract_version: attention.contractVersion,
        user_id: attention.userId,
        source_manager_code: attention.sourceManagerCode,
        source_conversation_id: attention.sourceConversationId,
        status: attention.status,
        item_type: attention.itemType,
        finding: attention.finding,
        recommended_communication: attention.recommendedCommunication,
        recommended_action: attention.recommendedAction,
        priority: attention.priority,
        urgency: attention.urgency,
        deadline_at: attention.deadlineAt,
        expires_at: attention.expiresAt,
        acknowledgement_required: attention.acknowledgementRequired,
        evidence_reference_ids: attention.evidenceReferenceIds,
        correlation_id: attention.correlationId,
        deduplication_key: attention.deduplicationKey,
        created_at: attention.createdAt,
      },
      { onConflict: "id", ignoreDuplicates: true },
    ),
    service.from("actions").upsert(
      {
        id: action.id,
        user_id: action.userId,
        run_id: action.runId,
        manager_id: manager.id,
        action_type: action.actionType,
        title: action.title,
        description: action.description,
        risk_class: action.riskClass,
        status: action.status,
        proposed_payload: toNonNullJson(action.proposedPayload),
        contract_version: action.contractVersion,
        approval_required: false,
        authority: action.authority,
        approval_state: action.approvalState,
        required_capability: action.requiredCapability,
        required_permissions: action.requiredPermissions,
        conversation_id: action.conversationId,
        source_message_id: action.sourceMessageId,
        correlation_id: action.correlationId,
        idempotency_key: action.idempotencyKey,
        created_at: action.createdAt,
        updated_at: action.updatedAt,
      },
      { onConflict: "id", ignoreDuplicates: true },
    ),
    service.from("evidence_references").upsert(
      {
        id: evidence.id,
        user_id: evidence.userId,
        contract_version: evidence.contractVersion,
        source_type: evidence.sourceType,
        source_key: evidence.sourceKey,
        title: evidence.title,
        sha256: evidence.sha256,
        captured_at: evidence.capturedAt,
        verification_method: evidence.verificationMethod,
        confidence: evidence.confidence,
        provenance: toNonNullJson(evidence.provenance),
        created_at: evidence.createdAt,
      },
      { onConflict: "id", ignoreDuplicates: true },
    ),
    service.from("evidence_links").upsert(
      evidenceLinks.map((link) => ({
        id: link.id,
        contract_version: link.contractVersion,
        evidence_reference_id: link.evidenceReferenceId,
        user_id: link.userId,
        entity_type: link.entityType,
        entity_id: link.entityId,
        relation: link.relation,
        created_at: link.createdAt,
      })),
      { onConflict: "id", ignoreDuplicates: true },
    ),
  ];
  for (const [index, insert] of inserts.entries()) {
    const { error } = await insert;
    if (error) {
      const step = agentRuntimeFixtureUpsertSteps[index];
      if (!step) return null;
      console.error(JSON.stringify(agentRuntimeFixtureWriteFailure(
        step,
        error,
        conversation.correlationId,
      )));
      return null;
    }
  }
  const { error: auditError } = await service.from("audit_events").upsert({
    id: conversation.id,
    user_id: userId,
    actor_type: "user",
    action_type: "create_ai14_contract_fixture",
    target_type: "conversation",
    target_id: conversation.id,
    aal: "aal2",
    correlation_id: conversation.correlationId,
    result: "success",
    redacted_after: { fixture: "ai14-live-e2e", fixtureKey },
  });
  if (auditError) {
    console.error(JSON.stringify(agentRuntimeFixtureWriteFailure(
      "audit_upsert",
      auditError,
      conversation.correlationId,
    )));
    return null;
  }
  return {
    fixtureKey,
    conversationId: conversation.id,
    ids: {
      messageId: message.id,
      handoffId: handoff.id,
      attentionId: attention.id,
      actionId: action.id,
      evidenceReferenceId: evidence.id,
    },
  };
}

async function readFixture(userId: string, conversationId: string) {
  const { data: conversationRow, error } = await service
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { status: 500, body: { code: "contract_read_failed" } };
  if (!conversationRow) {
    return { status: 404, body: { code: "conversation_not_found" } };
  }
  const metadata = conversationRow.metadata;
  if (
    typeof metadata !== "object" ||
    metadata === null ||
    Array.isArray(metadata) ||
    metadata.fixture !== "ai14-live-e2e" ||
    typeof metadata.fixtureKey !== "string" ||
    !/^ai14-live-e2e:[0-9a-f-]{36}$/i.test(metadata.fixtureKey)
  ) {
    return { status: 404, body: { code: "conversation_not_found" } };
  }

  const [participants, messages, handoffs, attentions, actions] = await Promise
    .all([
      service
        .from("conversation_participants")
        .select("*")
        .eq("conversation_id", conversationId)
        .eq("user_id", userId),
      service
        .from("conversation_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .eq("user_id", userId),
      service
        .from("conversation_handoffs")
        .select("*")
        .eq("conversation_id", conversationId)
        .eq("user_id", userId),
      service
        .from("attention_items")
        .select("*")
        .eq("source_conversation_id", conversationId)
        .eq("user_id", userId),
      service.from("actions").select(
        "id,user_id,conversation_id,status,approval_state",
      ).eq("conversation_id", conversationId)
        .eq("user_id", userId),
    ]);
  if (
    [participants, messages, handoffs, attentions, actions].some(
      ({ error: queryError }) => queryError,
    )
  ) {
    return { status: 500, body: { code: "contract_read_failed" } };
  }
  const entityIds = [
    conversationId,
    ...(messages.data ?? []).map(({ id }) => id),
    ...(handoffs.data ?? []).map(({ id }) => id),
    ...(attentions.data ?? []).map(({ id }) => id),
    ...(actions.data ?? []).map(({ id }) => id),
  ];
  const { data: evidenceLinks, error: linksError } = await service
    .from("evidence_links")
    .select("*")
    .eq("user_id", userId)
    .in("entity_id", entityIds);
  if (linksError) {
    return { status: 500, body: { code: "contract_read_failed" } };
  }
  const evidenceIds = [
    ...new Set(
      (evidenceLinks ?? []).map(({ evidence_reference_id }) =>
        evidence_reference_id
      ),
    ),
  ];
  const { data: evidence, error: evidenceError } = evidenceIds.length
    ? await service
      .from("evidence_references")
      .select("*")
      .eq("user_id", userId)
      .in("id", evidenceIds)
    : { data: [], error: null };
  if (evidenceError) {
    return { status: 500, body: { code: "contract_read_failed" } };
  }
  try {
    return {
      status: 200,
      body: {
        conversation: deserializeConversation(conversationRow),
        participants: participants.data ?? [],
        messages: (messages.data ?? []).map(deserializeConversationMessage),
        handoffs: handoffs.data ?? [],
        attentionItems: attentions.data ?? [],
        actions: actions.data ?? [],
        evidenceReferences: evidence ?? [],
        evidenceLinks: evidenceLinks ?? [],
      },
    };
  } catch {
    return { status: 500, body: { code: "contract_deserialization_failed" } };
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ code: "method_not_allowed" }, 405);
  }
  if (!isAllowedRuntimeTarget()) return json({ code: "not_found" }, 404);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ code: "unauthorised" }, 401);
  }
  const token = authorization.slice("Bearer ".length);
  const caller = createClient<Database>(
    url,
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authorization } },
    },
  );
  const identity = await getAal2Identity(
    token,
    (jwt) => caller.auth.getUser(jwt),
  );
  if (
    !identity.user ||
    identity.user.email?.toLowerCase() !== "matthewirving99@gmail.com"
  ) {
    return json({ code: "unauthorised" }, 401);
  }
  if (
    !(await consumeRateLimit(identity.user.id, "agent_runtime_contracts", 20))
  ) {
    return json({ code: "rate_limited" }, 429);
  }
  const parsed = operationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return json({ code: "invalid_contract_request" }, 400);
  const input = parsed.data;
  if (input.operation === "create_fixture") {
    const created = await createFixture(identity.user.id, input.fixtureKey);
    if (!created) return json({ code: "contract_fixture_create_failed" }, 422);
    return json(created, 201);
  }
  if (input.operation === "read_fixture") {
    const result = await readFixture(identity.user.id, input.conversationId);
    return json(result.body, result.status);
  }
  const { data: handoff, error: handoffError } = await service
    .from("conversation_handoffs")
    .select("id,conversation_id")
    .eq("id", input.handoffId)
    .eq("user_id", identity.user.id)
    .maybeSingle();
  if (handoffError) return json({ code: "handoff_lookup_failed" }, 500);
  if (!handoff) return json({ code: "handoff_not_found" }, 404);
  const { data: conversation, error: conversationError } = await service
    .from("conversations")
    .select("metadata")
    .eq("id", handoff.conversation_id)
    .eq("user_id", identity.user.id)
    .maybeSingle();
  const metadata = conversation?.metadata;
  if (conversationError) {
    return json({ code: "conversation_lookup_failed" }, 500);
  }
  if (
    !conversation ||
    typeof metadata !== "object" ||
    metadata === null ||
    Array.isArray(metadata) ||
    metadata.fixture !== "ai14-live-e2e" ||
    typeof metadata.fixtureKey !== "string" ||
    !/^ai14-live-e2e:[0-9a-f-]{36}$/i.test(metadata.fixtureKey)
  ) {
    return json({ code: "handoff_not_found" }, 404);
  }
  const { data, error } = await service
    .from("conversation_handoffs")
    .update({ status: input.status })
    .eq("id", input.handoffId)
    .eq("user_id", identity.user.id)
    .select("id,conversation_id,status,accepted_at")
    .maybeSingle();
  if (error) {
    if (error.message.includes("invalid_agent_contract_transition")) {
      return json({ code: "invalid_transition" }, 409);
    }
    return json({ code: "handoff_transition_failed" }, 422);
  }
  if (!data) return json({ code: "handoff_not_found" }, 404);
  const { error: auditError } = await service.from("audit_events").upsert({
    id: data.id,
    user_id: identity.user.id,
    actor_type: "user",
    action_type: "transition_ai14_contract_handoff",
    target_type: "conversation_handoff",
    target_id: data.id,
    aal: "aal2",
    result: "success",
  });
  if (auditError) return json({ code: "handoff_audit_failed" }, 500);
  return json(data);
});
