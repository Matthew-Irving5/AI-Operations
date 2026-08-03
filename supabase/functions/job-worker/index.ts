import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const service = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async (request) => {
  if (
    request.headers.get("x-worker-secret") !== Deno.env.get("WORKER_SECRET")
  ) return json({ code: "unauthorised" }, 401);
  const workerId = request.headers.get("x-worker-id")?.slice(0, 100);
  if (!workerId) return json({ code: "worker_id_required" }, 400);
  const { data: jobs, error } = await service.rpc("claim_job_queue", {
    p_worker_id: workerId,
    p_limit: 1,
  });
  if (error) return json({ code: "queue_claim_failed" }, 500);
  const job = jobs?.[0] as {
    id: string;
    run_id: string;
    user_id: string;
    job_type: string;
  } | undefined;
  if (!job) return json({ job: null });
  if (job.job_type !== "workflow_execute") {
    return json({ code: "unsupported_job_type" }, 422);
  }
  const running = await service.from("workflow_runs").update({
    status: "running",
    started_at: new Date().toISOString(),
  }).eq("id", job.run_id).eq("status", "queued");
  if (running.error) return json({ code: "run_start_failed" }, 500);
  await service.from("trace_events").insert({
    user_id: job.user_id,
    correlation_id: crypto.randomUUID(),
    event_type: "job_leased",
    redacted_payload: { job_id: job.id, worker_id: workerId },
  });
  const definition = await service.from("workflow_runs").select(
    "workflow_definitions(code)",
  ).eq("id", job.run_id).single();
  const code =
    (definition.data?.workflow_definitions as { code?: string } | null)?.code;
  const completed = await service.rpc(
    code?.startsWith("personal-")
      ? "complete_personal_run"
      : code?.startsWith("health-") || code?.startsWith("finance-")
      ? "complete_health_finance_run"
      : code?.startsWith("career-") || code?.startsWith("travel-") ||
          code?.startsWith("procurement-")
      ? "complete_career_travel_procurement_run"
      : "complete_synthetic_systems_run",
    { p_run_id: job.run_id },
  );
  if (completed.error) {
    await service.rpc("complete_job_queue", {
      p_job_id: job.id,
      p_worker_id: workerId,
      p_succeeded: false,
      p_redacted_error: "synthetic_execution_failed",
    });
    return json({ code: "workflow_execution_failed" }, 500);
  }
  const queueCompletion = await service.rpc("complete_job_queue", {
    p_job_id: job.id,
    p_worker_id: workerId,
    p_succeeded: true,
    p_redacted_error: null,
  });
  if (queueCompletion.error) {
    return json({ code: "queue_completion_failed" }, 500);
  }
  return json({
    job: { id: job.id, runId: job.run_id, type: job.job_type },
    reportId: completed.data,
  });
});
