import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { verifySharedSecret } from "../_shared/auth-contract.ts";
import { createJobWorkerHandler } from "./handler.ts";

const service = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const workerSecret = Deno.env.get("WORKER_SECRET");

Deno.serve(createJobWorkerHandler({
  isAuthorized: (request) =>
    verifySharedSecret(request, "x-worker-secret", workerSecret),
  claim: async (workerId) => {
    const { data, error } = await service.rpc("claim_job_queue", {
      p_worker_id: workerId,
      p_limit: 1,
    });
    return { data, error: error !== null };
  },
  claimForRun: async (workerId, runId) => {
    const { data, error } = await service.rpc("claim_job_queue_for_run", {
      p_worker_id: workerId,
      p_run_id: runId,
    });
    return { data, error: error !== null };
  },
  execute: async (runId) => {
    const { data, error } = await service.functions.invoke("ai-execute", {
      body: { runId },
      headers: { "x-worker-secret": workerSecret ?? "" },
    });
    return { data, error: error !== null };
  },
  complete: async (jobId, workerId, outcome, errorCode) => {
    const { error } = await service.rpc("complete_job_queue", {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_outcome: outcome,
      p_redacted_error: errorCode,
    });
    return { error: error !== null };
  },
}));
