export const agentRuntimeFixtureWriteTargets = {
  manager_lookup: "managers",
  conversation_upsert: "conversations",
  participants_upsert: "conversation_participants",
  message_upsert: "conversation_messages",
  handoff_upsert: "conversation_handoffs",
  attention_upsert: "attention_items",
  action_upsert: "actions",
  evidence_reference_upsert: "evidence_references",
  evidence_links_upsert: "evidence_links",
  audit_upsert: "audit_events",
} as const;

export type AgentRuntimeFixtureWriteStep =
  keyof typeof agentRuntimeFixtureWriteTargets;

export const agentRuntimeFixtureUpsertSteps = [
  "conversation_upsert",
  "participants_upsert",
  "message_upsert",
  "handoff_upsert",
  "attention_upsert",
  "action_upsert",
  "evidence_reference_upsert",
  "evidence_links_upsert",
] as const satisfies readonly AgentRuntimeFixtureWriteStep[];

type DatabaseErrorEvidence = Readonly<{
  code?: unknown;
  constraint?: unknown;
  message?: unknown;
}>;

const sqlStatePattern = /^[0-9A-Z]{5}$/;
const constraintNamePattern = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const correlationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeConstraintName(error: DatabaseErrorEvidence): string | undefined {
  const directConstraint = typeof error.constraint === "string"
    ? error.constraint
    : undefined;
  const messageConstraint = typeof error.message === "string"
    ? error.message.match(/constraint\s+"([^"]{1,128})"/i)?.[1]
    : undefined;
  const candidate = directConstraint ?? messageConstraint;
  return candidate && constraintNamePattern.test(candidate)
    ? candidate
    : undefined;
}

export function agentRuntimeFixtureWriteFailure(
  step: AgentRuntimeFixtureWriteStep,
  error: DatabaseErrorEvidence,
  correlationId: string,
) {
  const sqlState = typeof error.code === "string" &&
      sqlStatePattern.test(error.code)
    ? error.code
    : "unknown";
  const constraint = safeConstraintName(error);

  return {
    event: "agent_runtime_fixture_write_failed",
    step,
    table: agentRuntimeFixtureWriteTargets[step],
    sqlState,
    ...(constraint ? { constraint } : {}),
    correlationId: correlationIdPattern.test(correlationId)
      ? correlationId
      : "unavailable",
  } as const;
}
