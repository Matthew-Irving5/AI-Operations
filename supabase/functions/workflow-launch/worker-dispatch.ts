import { isWellFormedSharedSecret } from "../_shared/auth-contract.ts";

export type JobWorkerInvoker = (input: {
  body: { runId: string };
  headers: { "x-worker-id": string; "x-worker-secret": string };
}) => Promise<{ error: unknown | null }>;

export type WorkflowLaunchDispatchEvent = Readonly<{
  event:
    | "workflow_launch_dispatch_failed"
    | "workflow_launch_wait_until_unavailable";
  runId: string;
  stage: "worker_dispatch" | "wait_until";
}>;

export type AcceptedWorkflowLaunch = Readonly<{
  status: 201;
  body: { runId: string };
}>;

export function createWorkflowRunDispatcher(
  workerSecret: string | undefined,
  invoke: JobWorkerInvoker,
): (runId: string) => Promise<boolean> {
  return async (runId) => {
    if (!isWellFormedSharedSecret(workerSecret)) return false;
    try {
      const result = await invoke({
        body: { runId },
        headers: {
          "x-worker-id": `workflow-launch:${runId}`,
          "x-worker-secret": workerSecret,
        },
      });
      return result.error === null;
    } catch {
      return false;
    }
  };
}

/**
 * Start the run-targeted worker after the durable run/job write has succeeded.
 * EdgeRuntime.waitUntil keeps the task alive without making launch latency
 * depend on the worker's execution time. A failed dispatch leaves the durable
 * queue row untouched so the normal worker claim/retry path can recover it.
 */
export function scheduleWorkflowRunDispatch(
  runId: string,
  dispatch: (runId: string) => Promise<boolean>,
  waitUntil: ((task: Promise<unknown>) => void) | undefined,
  log: (event: WorkflowLaunchDispatchEvent) => void,
): void {
  if (!waitUntil) {
    log({
      event: "workflow_launch_wait_until_unavailable",
      runId,
      stage: "wait_until",
    });
    return;
  }

  let registered = false;
  const task = Promise.resolve()
    .then(async () => {
      if (!registered) return;
      if (!(await dispatch(runId))) {
        log({
          event: "workflow_launch_dispatch_failed",
          runId,
          stage: "worker_dispatch",
        });
      }
    })
    .catch(() => {
      log({
        event: "workflow_launch_dispatch_failed",
        runId,
        stage: "worker_dispatch",
      });
    });

  try {
    waitUntil(task);
    registered = true;
  } catch {
    log({
      event: "workflow_launch_wait_until_unavailable",
      runId,
      stage: "wait_until",
    });
    // The task is already started. Keep its rejection handled; the queue claim
    // lease and retry contract remains the source of recovery.
    void task;
  }
}

export function acceptCreatedWorkflowRun(
  runId: string,
  dispatch: (runId: string) => Promise<boolean>,
  waitUntil: ((task: Promise<unknown>) => void) | undefined,
  log: (event: WorkflowLaunchDispatchEvent) => void,
): AcceptedWorkflowLaunch {
  scheduleWorkflowRunDispatch(runId, dispatch, waitUntil, log);
  return { status: 201, body: { runId } };
}
