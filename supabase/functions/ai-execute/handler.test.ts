import { createWorkflowExecutionHandler } from "./handler.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`assertion_failed:${JSON.stringify({ actual, expected })}`);
  }
}

const runId = "11111111-1111-4111-8111-111111111111";
const handler = (execute: (runId: string) => Promise<unknown>) =>
  createWorkflowExecutionHandler({
    workerSecret: "worker-secret",
    serviceRoleKey: "service-role",
    execute,
    timingSafeEqual: (left, right) => left === right,
  });

Deno.test(
  "ai-execute accepts only worker-authenticated canonical runId and returns typed outcome",
  async () => {
    const received: string[] = [];
    const response = await handler((id) => {
      received.push(id);
      return Promise.resolve({
        runId: id,
        outcome: "succeeded",
        reportId: "22222222-2222-4222-8222-222222222222",
      });
    })(
      new Request("https://local.test/ai-execute", {
        method: "POST",
        headers: {
          "x-worker-secret": "worker-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ runId }),
      }),
    );
    assertEquals(response.status, 200);
    assertEquals(received, [runId]);
    assertEquals(await response.json(), {
      runId,
      outcome: "succeeded",
      reportId: "22222222-2222-4222-8222-222222222222",
    });
  },
);

Deno.test(
  "ai-execute rejects caller execution controls and invalid credentials before executing",
  async () => {
    let calls = 0;
    const execute = () => {
      calls += 1;
      return Promise.resolve({
        runId,
        outcome: "retryable_failure",
        errorCode: "provider_timeout",
      });
    };
    const unauthorized = await handler(execute)(
      new Request("https://local.test/ai-execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId }),
      }),
    );
    assertEquals(unauthorized.status, 401);
    const uncontrolled = await handler(execute)(
      new Request("https://local.test/ai-execute", {
        method: "POST",
        headers: {
          "x-worker-secret": "worker-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ runId, model: "caller-selected-model" }),
      }),
    );
    assertEquals(uncontrolled.status, 400);
    assertEquals(calls, 0);
  },
);

Deno.test("ai-execute refuses outcomes for a different run", async () => {
  const response = await handler(() =>
    Promise.resolve({
      runId: "33333333-3333-4333-8333-333333333333",
      outcome: "retryable_failure",
      errorCode: "provider_timeout",
    })
  )(
    new Request("https://local.test/ai-execute", {
      method: "POST",
      headers: {
        authorization: "Bearer service-role",
        "content-type": "application/json",
      },
      body: JSON.stringify({ runId }),
    }),
  );
  assertEquals(response.status, 500);
  assertEquals(await response.json(), { code: "invalid_execution_outcome" });
});
