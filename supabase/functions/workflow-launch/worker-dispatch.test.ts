import {
  createWorkflowRunDispatcher,
  type JobWorkerInvoker,
} from "./worker-dispatch.ts";

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

  if (!await dispatch(runId)) throw new Error("dispatch_should_succeed");
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
