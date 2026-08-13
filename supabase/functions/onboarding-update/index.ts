import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { consumeRateLimit } from "../_shared/rate-limit.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const service = createClient(
  url,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const codes = new Set([
  "supabase",
  "cloudflare_r2",
  "openai",
  "google_oauth",
  "initial_login",
  "totp",
  "gmail_test",
  "apple_bridge",
  "health_export",
  "source_permissions",
  "windows_worker",
  "personal_profile",
  "finance_mapping",
  "github_connection",
  "schedule_review",
  "restore_test",
  "production_acceptance",
]);
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
  const body = await request.json().catch(() => null) as {
    code?: string;
    complete?: boolean;
  } | null;
  if (
    !identity.user ||
    identity.user.email?.toLowerCase() !== "matthewirving99@gmail.com"
  ) return json({ code: "fresh_mfa_required" }, 403);
  if (!await consumeRateLimit(identity.user.id, "onboarding_update", 30)) {
    return json({ code: "rate_limited" }, 429);
  }
  if (
    !body || !codes.has(body.code ?? "") || typeof body.complete !== "boolean"
  ) return json({ code: "invalid_checklist_item" }, 400);
  if (body.code === "production_acceptance") {
    return json({ code: "acceptance_requires_finalise" }, 422);
  }
  const completed_at = body.complete ? new Date().toISOString() : null;
  const update = await service.from("onboarding_checklist_items").upsert({
    user_id: identity.user.id,
    code: body.code,
    completed_at,
  }, { onConflict: "user_id,code" });
  if (update.error) return json({ code: "onboarding_update_failed" }, 500);
  await service.from("audit_events").insert({
    user_id: identity.user.id,
    actor_type: "user",
    action_type: "onboarding_item_updated",
    target_type: "onboarding_checklist",
    target_id: body.code,
    aal: "aal2",
    result: "success",
    redacted_after: { complete: body.complete },
  });
  return json({ code: body.code, completedAt: completed_at });
});
