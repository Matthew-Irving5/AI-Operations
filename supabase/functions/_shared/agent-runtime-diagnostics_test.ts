import {
  agentRuntimeFixtureUpsertSteps,
  agentRuntimeFixtureWriteFailure,
  agentRuntimeFixtureWriteTargets,
} from "./agent-runtime-diagnostics.ts";

Deno.test("fixture write diagnostics identify only the fixed DB boundary", () => {
  const diagnostic = agentRuntimeFixtureWriteFailure(
    "conversation_upsert",
    {
      code: "23514",
      message: 'new row violates check constraint "conversations_status_check"',
    },
    "f3e20e09-3ce4-41b0-8f74-33dd73f726a8",
  );

  if (
    diagnostic.event !== "agent_runtime_fixture_write_failed" ||
    diagnostic.step !== "conversation_upsert" ||
    diagnostic.table !== "conversations" ||
    diagnostic.sqlState !== "23514" ||
    diagnostic.failureKind !== "unknown" ||
    diagnostic.constraint !== "conversations_status_check" ||
    diagnostic.correlationId !== "f3e20e09-3ce4-41b0-8f74-33dd73f726a8"
  ) {
    throw new Error("fixture_write_failure_boundary_not_reported");
  }
});

Deno.test("fixture diagnostics classify permission failures without raw messages", () => {
  const cases = [
    ["permission denied for table actions", "table_permission_denied"],
    [
      "permission denied for column id of relation actions",
      "column_permission_denied",
    ],
    [
      "permission denied for sequence actions_id_seq",
      "sequence_permission_denied",
    ],
    [
      "permission denied for function public.create_action()",
      "function_permission_denied",
    ],
    [
      "new row violates row-level security policy for table actions",
      "row_security_denied",
    ],
  ] as const;

  for (const [message, expectedKind] of cases) {
    const diagnostic = agentRuntimeFixtureWriteFailure(
      "action_upsert",
      {
        code: "42501",
        message: `${message}; user=private@example.test token=secret`,
      },
      "f3e20e09-3ce4-41b0-8f74-33dd73f726a8",
    );
    const serialized = JSON.stringify(diagnostic);
    if (
      diagnostic.failureKind !== expectedKind ||
      diagnostic.sqlState !== "42501" ||
      serialized.includes(message) ||
      serialized.includes("private@example.test") ||
      serialized.includes("secret")
    ) {
      throw new Error("permission_failure_classification_or_redaction_failed");
    }
  }
});

Deno.test("fixture diagnostics exclude raw errors, payload and identity data", () => {
  const rawMessage =
    'insert failed for user@example.test token=secret-value payload={"body":"private"}';
  const diagnostic = agentRuntimeFixtureWriteFailure(
    "action_upsert",
    {
      code: "23503",
      message: rawMessage,
      constraint: 'actions_user_id_fkey" token=secret-value',
    },
    "f3e20e09-3ce4-41b0-8f74-33dd73f726a8",
  );
  const serialized = JSON.stringify(diagnostic);

  for (
    const forbidden of [
      rawMessage,
      "user@example.test",
      "secret-value",
      "private",
    ]
  ) {
    if (serialized.includes(forbidden)) {
      throw new Error("fixture_write_diagnostic_leaked_raw_error_data");
    }
  }
  if (
    diagnostic.step !== "action_upsert" ||
    diagnostic.table !== "actions" ||
    diagnostic.sqlState !== "23503" ||
    "constraint" in diagnostic
  ) {
    throw new Error("unsafe_constraint_name_was_not_rejected");
  }
});

Deno.test("fixture write targets stay within the explicit table map", () => {
  if (
    Object.values(agentRuntimeFixtureWriteTargets).join(",") !==
      "managers,conversations,conversation_participants,conversation_messages,conversation_handoffs,attention_items,actions,evidence_references,evidence_links,audit_events"
  ) {
    throw new Error("fixture_write_target_map_changed");
  }
  if (
    agentRuntimeFixtureUpsertSteps.join(",") !==
      "conversation_upsert,participants_upsert,message_upsert,handoff_upsert,attention_upsert,action_upsert,evidence_reference_upsert,evidence_links_upsert"
  ) {
    throw new Error("fixture_write_step_order_changed");
  }
});

Deno.test("fixture diagnostics fail closed on malformed SQLSTATE and correlation", () => {
  const diagnostic = agentRuntimeFixtureWriteFailure(
    "message_upsert",
    { code: "23503 secret", message: 'constraint "unsafe-name; select"' },
    "not-a-correlation-id",
  );
  if (
    diagnostic.sqlState !== "unknown" ||
    diagnostic.correlationId !== "unavailable" ||
    "constraint" in diagnostic
  ) {
    throw new Error("malformed_fixture_diagnostic_fields_were_not_rejected");
  }
});
