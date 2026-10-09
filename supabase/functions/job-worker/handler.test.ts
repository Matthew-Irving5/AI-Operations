import {
  createJobWorkerHandler,
  type JobWorkerDependencies,
} from "./handler.ts";

const jobId = "00000000-0000-4000-8000-000000001801";
const runId = "00000000-0000-4000-8000-000000001802";
const reportId = "00000000-0000-4000-8000-000000001803";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }`,
    );
  }
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function request(
  options: { method?: string; authorized?: boolean; workerId?: string } = {},
): Request {
  const headers = new Headers();
  if (options.authorized !== false) headers.set("x-worker-secret", "valid");
  if (options.workerId !== undefined) {
    headers.set("x-worker-id", options.workerId);
  }
  return new Request("https://local.test/job-worker", {
    method: options.method ?? "POST",
    headers,
  });
}

function dependencies(
  overrides: Partial<JobWorkerDependencies> = {},
): {
  handler: (request: Request) => Promise<Response>;
  completions: Array<{
    jobId: string;
    workerId: string;
    outcome: string;
    errorCode: string | null;
  }>;
  executions: string[];
} {
  const completions: Array<{
    jobId: string;
    workerId: string;
    outcome: string;
    errorCode: string | null;
  }> = [];
  const executions: string[] = [];
  const resolved: JobWorkerDependencies = {
    isAuthorized: () => true,
    claim: () =>
      Promise.resolve({
        data: [{ id: jobId, run_id: runId, job_type: "workflow_execute" }],
        error: false,
      }),
    execute: (requestedRunId) => {
      executions.push(requestedRunId);
      return Promise.resolve({
        data: { runId, outcome: "succeeded", reportId },
        error: false,
      });
    },
    complete: (completedJobId, workerId, outcome, errorCode) => {
      completions.push({
        jobId: completedJobId,
        workerId,
        outcome,
        errorCode,
      });
      return Promise.resolve({ error: false });
    },
    ...overrides,
  };
  return {
    handler: createJobWorkerHandler(resolved),
    completions,
    executions,
  };
}

Deno.test("job worker rejects non-POST and unauthorized requests before claiming", async () => {
  let claims = 0;
  const deps = dependencies({
    isAuthorized: (incoming) =>
      incoming.headers.get("x-worker-secret") === "valid",
    claim: () => {
      claims += 1;
      return Promise.resolve({ data: [], error: false });
    },
  });

  assertEquals((await deps.handler(request({ method: "GET" }))).status, 405);
  assertEquals(
    (await deps.handler(request({ authorized: false }))).status,
    401,
  );
  assertEquals(claims, 0);
});

Deno.test("job worker passes only the claimed run ID to ai-execute", async () => {
  const deps = dependencies();
  const response = await deps.handler(request({ workerId: "worker-a" }));

  assertEquals(response.status, 200);
  assertEquals(deps.executions, [runId]);
  assertEquals(deps.completions, [{
    jobId,
    workerId: "worker-a",
    outcome: "succeeded",
    errorCode: null,
  }]);
  assertEquals(await body(response), {
    job: { id: jobId, runId },
    reportId,
  });
});

Deno.test("job worker maps retryable and terminal executor outcomes exactly", async () => {
  for (const outcome of ["retryable_failure", "terminal_failure"] as const) {
    const deps = dependencies({
      execute: () =>
        Promise.resolve({
          data: { runId, outcome, errorCode: "provider_unavailable" },
          error: false,
        }),
    });
    const response = await deps.handler(request({ workerId: "worker-b" }));

    assertEquals(response.status, 200);
    assertEquals(deps.completions, [{
      jobId,
      workerId: "worker-b",
      outcome,
      errorCode: "provider_unavailable",
    }]);
    assertEquals(await body(response), {
      code: "provider_unavailable",
      outcome,
    });
  }
});

Deno.test("job worker acknowledges submitted background responses without completing", async () => {
  const responseId = "resp_123456789";
  const deps = dependencies({
    execute: () =>
      Promise.resolve({
        data: { runId, outcome: "submitted", responseId },
        error: false,
      }),
  });
  const response = await deps.handler(request({ workerId: "worker-pending" }));

  assertEquals(response.status, 202);
  assertEquals(deps.completions, []);
  assertEquals(await body(response), {
    job: { id: jobId, runId, status: "awaiting_provider" },
    responseId,
  });
});

Deno.test("job worker retries malformed or cross-run executor results without leaking data", async () => {
  const deps = dependencies({
    execute: () =>
      Promise.resolve({
        data: {
          runId: reportId,
          outcome: "terminal_failure",
          errorCode: "secret_value_must_not_escape",
        },
        error: false,
      }),
  });
  const response = await deps.handler(request({ workerId: "worker-c" }));

  assertEquals(response.status, 200);
  assertEquals(deps.completions, [{
    jobId,
    workerId: "worker-c",
    outcome: "retryable_failure",
    errorCode: "executor_unavailable_or_invalid_response",
  }]);
  assertEquals(await body(response), {
    code: "executor_unavailable_or_invalid_response",
    outcome: "retryable_failure",
  });
});

Deno.test("job worker preserves the lease when queue completion fails", async () => {
  const deps = dependencies({
    complete: () => Promise.resolve({ error: true }),
  });
  const response = await deps.handler(request({ workerId: "worker-d" }));

  assertEquals(response.status, 502);
  assertEquals(await body(response), { code: "queue_completion_failed" });
});
