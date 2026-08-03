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
    request.headers.get("x-scheduler-secret") !==
      Deno.env.get("SCHEDULER_SECRET")
  ) return json({ code: "unauthorised" }, 401);
  const { data, error } = await service.rpc("dispatch_due_schedules");
  if (error) return json({ code: "schedule_dispatch_failed" }, 500);
  return json({ created: data?.length ?? 0, runs: data ?? [] });
});
