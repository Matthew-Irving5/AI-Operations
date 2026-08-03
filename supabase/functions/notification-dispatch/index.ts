import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const service = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
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
  if (
    request.headers.get("x-notification-secret") !==
      Deno.env.get("NOTIFICATION_SECRET")
  ) {
    return json({ code: "unauthorised" }, 401);
  }
  const accessToken = Deno.env.get("GMAIL_ACCESS_TOKEN");
  if (!accessToken) return json({ code: "gmail_not_configured" }, 503);
  const { data: notifications, error } = await service.from("notifications")
    .select("id,recipient,subject,body_reference,correlation_id")
    .eq("status", "queued")
    .order("created_at")
    .limit(20);
  if (error) return json({ code: "notification_lookup_failed" }, 500);
  let sent = 0;
  let failed = 0;
  for (const notification of notifications ?? []) {
    if (notification.recipient.toLowerCase() !== recipient) {
      await service.from("notifications").update({ status: "failed" }).eq(
        "id",
        notification.id,
      );
      failed += 1;
      continue;
    }
    const body = [
      `To: ${recipient}`,
      `Subject: ${notification.subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      "A new AI Operations notification is available.",
      notification.body_reference ??
        "Open the authenticated AI Operations dashboard to view it.",
      `Correlation ID: ${notification.correlation_id ?? "not recorded"}`,
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
    const result = await response.json() as { id?: string };
    if (!response.ok || !result.id) {
      failed += 1;
      continue;
    }
    const updated = await service.from("notifications").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      gmail_message_id: result.id,
    }).eq("id", notification.id).eq("status", "queued");
    if (updated.error) failed += 1;
    else sent += 1;
  }
  return json({ sent, failed });
});
