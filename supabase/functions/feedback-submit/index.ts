import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const service = createClient(
  url,
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
  const token = request.headers.get("authorization");
  if (!token?.startsWith("Bearer ")) return json({ code: "unauthorised" }, 401);
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: token } },
  });
  const { data: identity } = await caller.auth.getUser();
  if (
    !identity.user ||
    identity.user.email?.toLowerCase() !== "matthewirving99@gmail.com"
  ) return json({ code: "forbidden" }, 403);
  const body = await request.json() as {
    reportId?: string;
    positive?: boolean;
    categories?: string[];
    comment?: string;
  };
  if (
    !body.reportId || typeof body.positive !== "boolean" ||
    !Array.isArray(body.categories) || body.categories.some((category) =>
      typeof category !== "string" || category.length > 100
    ) || (body.comment?.length ?? 0) > 2000
  ) {
    return json({ code: "invalid_feedback" }, 400);
  }
  const report = await service.from("reports").select("id,run_id").eq(
    "id",
    body.reportId,
  ).eq("user_id", identity.user.id).maybeSingle();
  if (report.error || !report.data) {
    return json({ code: "report_not_found" }, 404);
  }
  const feedback = await service.from("feedback").insert({
    user_id: identity.user.id,
    report_id: report.data.id,
    positive: body.positive,
    categories: body.categories,
    comment: body.comment?.trim() || null,
  }).select("id").single();
  if (feedback.error) {
    return json({ code: "feedback_store_failed" }, 500);
  }
  const run = await service.from("workflow_runs").select("correlation_id").eq(
    "id",
    report.data.run_id,
  ).maybeSingle();
  if (run.data) {
    await service.from("trace_events").insert({
      user_id: identity.user.id,
      correlation_id: run.data.correlation_id,
      event_type: "feedback_submitted",
      redacted_payload: {
        feedback_id: feedback.data.id,
        positive: body.positive,
        categories: body.categories,
      },
    });
  }
  await service.from("audit_events").insert({
    user_id: identity.user.id,
    actor_type: "user",
    action_type: "submit_feedback",
    target_type: "report",
    target_id: report.data.id,
    aal: "authenticated",
    result: "success",
  });
  return json({ feedbackId: feedback.data.id }, 201);
});
