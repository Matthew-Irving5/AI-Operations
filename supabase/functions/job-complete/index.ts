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
  if (request.method !== "POST") {
    return json({ code: "method_not_allowed" }, 405);
  }
  if (
    request.headers.get("x-worker-secret") !== Deno.env.get("WORKER_SECRET")
  ) return json({ code: "unauthorised" }, 401);
  const workerId = request.headers.get("x-worker-id")?.slice(0, 100);
  const body = await request.json() as {
    jobId?: string;
    succeeded?: boolean;
    redactedError?: string;
  };
  if (!workerId || !body.jobId || typeof body.succeeded !== "boolean") {
    return json({ code: "invalid_completion" }, 400);
  }
  const { data, error } = await service.rpc("complete_job_queue", {
    p_job_id: body.jobId,
    p_worker_id: workerId,
    p_succeeded: body.succeeded,
    p_redacted_error: body.redactedError?.slice(0, 2000) ?? null,
  });
  return error ? json({ code: "completion_failed" }, 409) : json({ job: data });
});
