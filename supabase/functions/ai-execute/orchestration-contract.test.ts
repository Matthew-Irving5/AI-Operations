import {
  executeWorkflowOutcomeSchema,
  executeWorkflowRequestSchema,
  loadTrustedWorkflowExecution,
} from "./orchestration-contract.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`assertion_failed:${JSON.stringify({ actual, expected })}`);
  }
}

async function assertRejects(
  action: () => Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof Error && error.message.includes(message)) return;
    throw new Error(
      `unexpected_rejection:${
        error instanceof Error ? error.message : "unknown"
      }`,
    );
  }
  throw new Error(`expected_rejection:${message}`);
}

const runId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const workflowId = "33333333-3333-4333-8333-333333333333";
const correlationId = "44444444-4444-4444-8444-444444444444";
const timestamp = "2026-10-09T12:00:00.000Z";

Deno.test("executor request accepts only a canonical run id", () => {
  assertEquals(executeWorkflowRequestSchema.safeParse({ runId }).success, true);
  assertEquals(
    executeWorkflowRequestSchema.safeParse({ runId, managerCode: "finance" })
      .success,
    false,
  );
  assertEquals(
    executeWorkflowRequestSchema.safeParse({ runId, model: "gpt-5.6-sol" })
      .success,
    false,
  );
  assertEquals(
    executeWorkflowRequestSchema.safeParse({ runId: "not-a-uuid" }).success,
    false,
  );
});

Deno.test(
  "executor loads user, manager, workflow and input from canonical storage by run id",
  async () => {
    const calls: string[] = [];
    const execution = await loadTrustedWorkflowExecution(runId, {
      loadRun: (id) => {
        calls.push(`run:${id}`);
        return Promise.resolve({
          contractVersion: 1,
          id: runId,
          userId,
          workflowDefinitionId: workflowId,
          managerCode: "personal",
          status: "running",
          trigger: "on_demand",
          correlationId,
          idempotencyKey: "personal:request:12345",
          priority: 1,
          requestedAt: timestamp,
          startedAt: timestamp,
          completedAt: null,
          cancelledAt: null,
          errorCode: null,
          redactedError: null,
          reportId: null,
          budgetReservationId: null,
        });
      },
      loadDefinition: (id) => {
        calls.push(`definition:${id}`);
        return Promise.resolve({
          contractVersion: 1,
          id: workflowId,
          managerCode: "personal",
          code: "personal-morning-plan",
          version: 1,
          triggerType: "manual_or_schedule",
          inputSchema: {},
          outputSchema: {},
          active: true,
        });
      },
      loadInput: (id) => {
        calls.push(`input:${id}`);
        return Promise.resolve({
          date: "2026-10-09",
          preference: "quiet morning",
        });
      },
    });

    assertEquals(calls, [
      `run:${runId}`,
      `definition:${workflowId}`,
      `input:${runId}`,
    ]);
    assertEquals(execution.run.userId, userId);
    assertEquals(execution.run.managerCode, "personal");
    assertEquals(execution.definition.code, "personal-morning-plan");
    assertEquals(execution.input, {
      date: "2026-10-09",
      preference: "quiet morning",
    });
  },
);

Deno.test(
  "executor rejects manager mismatch and caller-controlled workflow input fields",
  async () => {
    const source = {
      loadRun: () =>
        Promise.resolve({
          contractVersion: 1,
          id: runId,
          userId,
          workflowDefinitionId: workflowId,
          managerCode: "personal",
          status: "running",
          trigger: "on_demand",
          correlationId,
          idempotencyKey: "personal:request:12345",
          priority: 1,
          requestedAt: timestamp,
          startedAt: timestamp,
          completedAt: null,
          cancelledAt: null,
          errorCode: null,
          redactedError: null,
          reportId: null,
          budgetReservationId: null,
        }),
      loadDefinition: () =>
        Promise.resolve({
          contractVersion: 1,
          id: workflowId,
          managerCode: "finance",
          code: "personal-morning-plan",
          version: 1,
          triggerType: "manual_or_schedule",
          inputSchema: {},
          outputSchema: {},
          active: true,
        }),
      loadInput: () => Promise.resolve({ model: "gpt-5.6-sol" }),
    };
    await assertRejects(
      () => loadTrustedWorkflowExecution(runId, source),
      "workflow_manager_contract_mismatch",
    );

    const trustedDefinition = {
      contractVersion: 1,
      id: workflowId,
      managerCode: "personal",
      code: "personal-morning-plan",
      version: 1,
      triggerType: "manual_or_schedule",
      inputSchema: {},
      outputSchema: {},
      active: true,
    };
    await assertRejects(
      () =>
        loadTrustedWorkflowExecution(runId, {
          ...source,
          loadDefinition: () => Promise.resolve(trustedDefinition),
        }),
      "workflow_input_contains_control_field",
    );
  },
);

Deno.test("executor response contract is closed and carries only safe outcome codes", () => {
  assertEquals(
    executeWorkflowOutcomeSchema.safeParse({
      runId,
      outcome: "succeeded",
      reportId: workflowId,
    }).success,
    true,
  );
  assertEquals(
    executeWorkflowOutcomeSchema.safeParse({
      runId,
      outcome: "retryable_failure",
      errorCode: "provider_timeout",
      error: "raw secret must not be returned",
    }).success,
    false,
  );
  assertEquals(
    executeWorkflowOutcomeSchema.safeParse({
      runId,
      outcome: "terminal_failure",
      errorCode: "provider_timeout",
    }).success,
    true,
  );
  assertEquals(
    executeWorkflowOutcomeSchema.safeParse({
      runId,
      outcome: "submitted",
      responseId: "resp_1234567890",
    }).success,
    true,
  );
  assertEquals(
    executeWorkflowOutcomeSchema.safeParse({
      runId,
      outcome: "submitted",
      responseId: "invalid",
    }).success,
    false,
  );
});
