import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { consumeRateLimit } from "../_shared/rate-limit.ts";

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
  const [{ data: identity }, { data: assurance }] = await Promise.all([
    caller.auth.getUser(),
    caller.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  const body = await request.json().catch(() => null) as {
    scheduleId?: string;
    enabled?: boolean;
  } | null;
  if (
    !identity.user ||
    identity.user.email?.toLowerCase() !== "matthewirving99@gmail.com" ||
    assurance?.currentLevel !== "aal2"
  ) return json({ code: "fresh_mfa_required" }, 403);
  if (!await consumeRateLimit(identity.user.id, "schedule_update", 10)) {
    return json({ code: "rate_limited" }, 429);
  }
  if (!body?.scheduleId || typeof body.enabled !== "boolean") {
    return json({ code: "invalid_schedule_update" }, 400);
  }
  if (body.enabled) {
    const complete = await service.rpc("production_onboarding_complete", {
      p_user_id: identity.user.id,
    });
    if (complete.error || !complete.data) {
      return json({ code: "onboarding_incomplete" }, 422);
    }
  }
  const update = await service.from("workflow_schedules").update({
    enabled: body.enabled,
  }).eq("id", body.scheduleId).eq("user_id", identity.user.id).select(
    "id,enabled",
  ).maybeSingle();
  if (update.error || !update.data) {
    return json({ code: "schedule_unavailable" }, 404);
  }
  await service.from("audit_events").insert({
    user_id: identity.user.id,
    actor_type: "user",
    action_type: "schedule_updated",
    target_type: "workflow_schedule",
    target_id: body.scheduleId,
    aal: "aal2_fresh",
    result: "success",
    redacted_after: { enabled: body.enabled },
  });
  return json({ schedule: update.data });
});
