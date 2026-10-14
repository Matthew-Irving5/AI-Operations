import {
  acceptCreatedWorkflowRun,
  createWorkflowRunDispatcher,
  type JobWorkerInvoker,
  scheduleWorkflowRunDispatch,
} from "./worker-dispatch.ts";

Deno.test("launch accepts immediately and tracks the exact run-targeted task", async () => {
  const runId = "00000000-0000-4000-8000-000000001881";
  let releaseDispatch: ((result: boolean) => void) | undefined;
  let scheduled: Promise<unknown> | undefined;
  let dispatchedRunId: string | undefined;
  const events: unknown[] = [];

  const accepted = acceptCreatedWorkflowRun(
    runId,
    (targetRunId) => {
      dispatchedRunId = targetRunId;
      return new Promise((resolve) => {
        releaseDispatch = resolve;
      });
    },
    (task) => {
      scheduled = task;
    },
    (event) => events.push(event),
  );

  if (accepted.status !== 201 || accepted.body.runId !== runId) {
    throw new Error("created_run_must_keep_the_existing_201_response_contract");
  }
  if (!scheduled) throw new Error("background_task_must_be_registered");
  if (dispatchedRunId !== undefined) {
    throw new Error("background_dispatch_must_begin_after_launch_acceptance");
  }
  if (events.length !== 0) {
    throw new Error("pending_dispatch_must_not_be_reported_as_failed");
  }

  await Promise.resolve();
  if (dispatchedRunId !== runId) {
    throw new Error("background_dispatch_must_target_the_created_run");
  }
  releaseDispatch?.(true);
  await scheduled;
  if (events.length !== 0) {
    throw new Error("successful_dispatch_must_not_log_failure");
  }
});

Deno.test("failed background dispatch logs only a safe stage and run identifier", async () => {
  const runId = "00000000-0000-4000-8000-000000001881";
  let scheduled: Promise<unknown> | undefined;
  const events: Array<Record<string, unknown>> = [];

  scheduleWorkflowRunDispatch(
    runId,
    () => Promise.resolve(false),
    (task) => {
      scheduled = task;
    },
    (event) => events.push(event),
  );

  await scheduled;
  if (
    JSON.stringify(events) !==
      JSON.stringify([
        {
          event: "workflow_launch_dispatch_failed",
          runId,
          stage: "worker_dispatch",
        },
      ])
  ) {
    throw new Error("dispatch_failure_log_must_be_safe_and_actionable");
  }
});

Deno.test("launch leaves the durable job untouched when waitUntil is unavailable", () => {
  const runId = "00000000-0000-4000-8000-000000001881";
  let dispatchCalls = 0;
  const events: Array<Record<string, unknown>> = [];

  const accepted = acceptCreatedWorkflowRun(
    runId,
    () => {
      dispatchCalls += 1;
      return Promise.resolve(true);
    },
    undefined,
    (event) => events.push(event),
  );

  if (accepted.status !== 201 || accepted.body.runId !== runId) {
    throw new Error("durable_run_must_keep_the_accepted_response");
  }
  if (dispatchCalls !== 0) {
    throw new Error(
      "dispatch_must_not_start_without_a_retained_background_task",
    );
  }
  if (
    JSON.stringify(events) !==
      JSON.stringify([
        {
          event: "workflow_launch_wait_until_unavailable",
          runId,
          stage: "wait_until",
        },
      ])
  ) {
    throw new Error("missing_wait_until_log_must_be_safe_and_actionable");
  }
});

Deno.test("launch does not start a worker if waitUntil registration throws", async () => {
  const runId = "00000000-0000-4000-8000-000000001881";
  let dispatchCalls = 0;
  const events: Array<Record<string, unknown>> = [];

  const accepted = acceptCreatedWorkflowRun(
    runId,
    () => {
      dispatchCalls += 1;
      return Promise.resolve(true);
    },
    () => {
      throw new Error("runtime_unavailable");
    },
    (event) => events.push(event),
  );
  await Promise.resolve();

  if (accepted.status !== 201 || dispatchCalls !== 0) {
    throw new Error("failed_wait_until_registration_must_not_start_worker");
  }
  if (events[0]?.event !== "workflow_launch_wait_until_unavailable") {
    throw new Error("failed_wait_until_registration_must_be_logged");
  }
});

Deno.test("launch dispatch targets only the queued run through worker auth", async () => {
  const runId = "00000000-0000-4000-8000-000000001881";
  let captured: Parameters<JobWorkerInvoker>[0] | undefined;
  const dispatch = createWorkflowRunDispatcher(
    "synthetic-worker-secret-value-32-bytes",
    (input) => {
      captured = input;
      return Promise.resolve({ error: null });
    },
  );

  if (!(await dispatch(runId))) throw new Error("dispatch_should_succeed");
  if (JSON.stringify(captured?.body) !== JSON.stringify({ runId })) {
    throw new Error("dispatch_body_must_contain_only_run_id");
  }
  if (captured?.headers["x-worker-id"] !== `workflow-launch:${runId}`) {
    throw new Error("dispatch_worker_id_must_be_run_scoped");
  }
  if (
    captured?.headers["x-worker-secret"] !==
      "synthetic-worker-secret-value-32-bytes"
  ) {
    throw new Error("worker_auth_must_be_sent_only_as_internal_header");
  }
});

Deno.test("launch dispatch fails closed without a configured worker secret", async () => {
  let invocations = 0;
  const dispatch = createWorkflowRunDispatcher(undefined, () => {
    invocations += 1;
    return Promise.resolve({ error: null });
  });

  if (await dispatch("00000000-0000-4000-8000-000000001881")) {
    throw new Error("missing_worker_secret_must_fail_closed");
  }
  if (invocations !== 0) {
    throw new Error("missing_secret_must_not_invoke_worker");
  }
});

Deno.test("launch dispatch reports an unavailable internal worker", async () => {
  const dispatch = createWorkflowRunDispatcher(
    "synthetic-worker-secret-value-32-bytes",
    () => Promise.resolve({ error: new Error("worker_unavailable") }),
  );

  if (await dispatch("00000000-0000-4000-8000-000000001881")) {
    throw new Error("worker_error_must_be_reported");
  }
});
