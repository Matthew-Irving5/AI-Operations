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
  if (
    !identity.user ||
    identity.user.email?.toLowerCase() !== "matthewirving99@gmail.com"
  ) return json({ code: "fresh_mfa_required" }, 403);
  const recentMfa = await service
    .from("mfa_reauthentication_events")
    .select("id")
    .eq("user_id", identity.user.id)
    .gte("verified_at", new Date(Date.now() - 5 * 60_000).toISOString())
    .limit(1);
  if (
    assurance?.currentLevel !== "aal2" &&
    (recentMfa.error || !recentMfa.data?.length)
  ) {
    return json({ code: "fresh_mfa_required" }, 403);
  }
  if (!await consumeRateLimit(identity.user.id, "onboarding_accept", 5)) {
    return json({ code: "rate_limited" }, 429);
  }
  const complete = await service.rpc("production_onboarding_complete", {
    p_user_id: identity.user.id,
  });
  if (complete.error || !complete.data) {
    return json({ code: "onboarding_incomplete" }, 422);
  }
  const audit = await service.from("audit_events").insert({
    user_id: identity.user.id,
    actor_type: "user",
    action_type: "production_onboarding_accepted",
    target_type: "production_acceptance",
    aal: "aal2_fresh",
    result: "success",
  }).select("id").single();
  if (audit.error || !audit.data) {
    return json({ code: "acceptance_audit_failed" }, 500);
  }
  const acknowledgement = await service.from("onboarding_checklist_items")
    .upsert({
      user_id: identity.user.id,
      code: "production_acceptance",
      completed_at: new Date().toISOString(),
      metadata: { acceptedVersion: "2026-08-03" },
    }, { onConflict: "user_id,code" });
  if (acknowledgement.error) {
    return json({ code: "acknowledgement_failed" }, 500);
  }
  const accepted = await service.from("production_acceptances").upsert({
    user_id: identity.user.id,
    accepted_at: new Date().toISOString(),
    accepted_version: "2026-08-03",
    audit_event_id: audit.data.id,
  });
  if (accepted.error) return json({ code: "acceptance_failed" }, 500);
  return json({ accepted: true });
});
