import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { verifySharedSecret } from "../_shared/auth-contract.ts";
import {
  GOOGLE_ACCOUNT_EMAILS,
  googleAccountConfig,
} from "../_shared/google-account-config.ts";
import { getGoogleMailboxAccessToken } from "../_shared/google-sync.ts";

const service = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const recipient = GOOGLE_ACCOUNT_EMAILS.personal_data_source;
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
    !verifySharedSecret(
      request,
      "x-notification-secret",
      Deno.env.get("NOTIFICATION_SECRET"),
    )
  ) {
    return json({ code: "unauthorised" }, 401);
  }
  const environment = Deno.env.get("AI_OPERATIONS_ENVIRONMENT");
  const appOrigin = Deno.env.get("PUBLIC_APP_ORIGIN") ??
    Deno.env.get("APP_PUBLIC_ORIGIN");
  const config = googleAccountConfig(environment, appOrigin);
  if (!config) {
    return json({ code: "google_environment_configuration_invalid" }, 503);
  }
  const mailboxRole = config.environment === "staging"
    ? "ai_operations_mailbox_staging"
    : "ai_operations_mailbox";
  let accessToken: string;
  try {
    ({ accessToken } = await getGoogleMailboxAccessToken(
      service,
      mailboxRole,
      config.environment,
    ));
  } catch {
    return json({ code: "gmail_mailbox_not_configured" }, 503);
  }
  const workerId = request.headers.get("x-notification-worker-id")?.slice(
    0,
    100,
  ) ?? "notification-dispatch";
  const { data: notifications, error } = await service.rpc(
    "claim_notification_delivery",
    { p_worker_id: workerId, p_limit: 20 },
  );
  if (error) return json({ code: "notification_lookup_failed" }, 500);
  let sent = 0;
  let failed = 0;
  for (const notification of notifications ?? []) {
    if (notification.recipient.toLowerCase() !== recipient) {
      await service.rpc("complete_notification_delivery", {
        p_notification_id: notification.id,
        p_worker_id: workerId,
        p_error: "notification_recipient_forbidden",
      });
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
      await service.rpc("complete_notification_delivery", {
        p_notification_id: notification.id,
        p_worker_id: workerId,
        p_error: `gmail_send_${response.status}`,
      });
      failed += 1;
      continue;
    }
    const completed = await service.rpc("complete_notification_delivery", {
      p_notification_id: notification.id,
      p_worker_id: workerId,
      p_gmail_message_id: result.id,
    });
    if (completed.error) failed += 1;
    else sent += 1;
  }
  return json({ sent, failed });
});
