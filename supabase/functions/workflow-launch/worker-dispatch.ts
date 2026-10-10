import { isWellFormedSharedSecret } from "../_shared/auth-contract.ts";

export type JobWorkerInvoker = (input: {
  body: { runId: string };
  headers: { "x-worker-id": string; "x-worker-secret": string };
}) => Promise<{ error: unknown | null }>;

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
