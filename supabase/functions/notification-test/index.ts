import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { consumeRateLimit } from "../_shared/rate-limit.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const service = createClient(
  url,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const recipient = "matthew.irving.ai@gmail.com";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const base64Url = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll(
    "=",
    "",
  );
};

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ code: "method_not_allowed" }, 405);
  }
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ code: "unauthorised" }, 401);
  }
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authorization } },
  });
  const { data: identity } = await caller.auth.getUser();
  if (
    !identity.user ||
    identity.user.email?.toLowerCase() !== "matthewirving99@gmail.com"
  ) {
    return json({ code: "authenticated_session_required" }, 403);
  }
  if (!await consumeRateLimit(identity.user.id, "gmail_test_notification", 3)) {
    return json({ code: "rate_limited" }, 429);
  }
  const accessToken = Deno.env.get("GMAIL_ACCESS_TOKEN");
  if (!accessToken) return json({ code: "gmail_not_configured" }, 503);
  const correlationId = crypto.randomUUID();
  const dedupeKey = `gmail-test:${correlationId}`;
  const notification = await service.from("notifications").insert({
    user_id: identity.user.id,
    type: "test",
    recipient,
    subject: "[AI Operations] Gmail delivery test",
    status: "sending",
    dedupe_key: dedupeKey,
    correlation_id: correlationId,
    body_reference:
      "This is a production Gmail delivery test. No secrets are included.",
  }).select("id").single();
  if (notification.error || !notification.data) {
    return json({ code: "notification_create_failed" }, 500);
  }
  const body = [
    `To: ${recipient}`,
    "Subject: [AI Operations] Gmail delivery test",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    "This is a production Gmail delivery test. No secrets are included.",
    `Correlation ID: ${correlationId}`,
  ].join("\r\n");
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ raw: base64Url(body) }),
    },
  );
  const result = await response.json().catch(() => ({})) as { id?: string };
  if (!response.ok || !result.id) {
    await service.from("notifications").update({
      status: "failed",
      last_error: `gmail_send_${response.status}`,
    }).eq("id", notification.data.id);
    await service.from("audit_events").insert({
      user_id: identity.user.id,
      actor_type: "user",
      action_type: "gmail_test_notification",
      target_type: "notification",
      target_id: notification.data.id,
      correlation_id: correlationId,
      aal: "aal2",
      result: "failed",
    });
    return json({ code: "gmail_send_failed", correlationId }, 502);
  }
  await service.from("notifications").update({
    status: "sent",
    sent_at: new Date().toISOString(),
    gmail_message_id: result.id,
  }).eq("id", notification.data.id);
  await service.from("audit_events").insert({
    user_id: identity.user.id,
    actor_type: "user",
    action_type: "gmail_test_notification",
    target_type: "notification",
    target_id: notification.data.id,
    correlation_id: correlationId,
    aal: "aal2",
    result: "success",
  });
  return json({ code: "gmail_test_sent", correlationId });
});
