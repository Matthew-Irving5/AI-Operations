import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const bridge = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_ANON_KEY") ?? "",
);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const digest = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
type Reminder = {
  externalId: string;
  list: string;
  title: string;
  notes?: string;
  dueAt?: string;
  completedAt?: string;
  recurrence?: string;
  priority?: number;
  lastModifiedAt: string;
};
type CalendarEvent = {
  externalId: string;
  calendar: string;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay?: boolean;
  location?: string;
  notes?: string;
  recurrence?: string;
  status?: string;
  lastModifiedAt: string;
};
function validReminder(value: unknown): value is Reminder {
  const item = value as Reminder;
  return !!item && typeof item.externalId === "string" &&
    typeof item.list === "string" && typeof item.title === "string" &&
    typeof item.lastModifiedAt === "string";
}
function validEvent(value: unknown): value is CalendarEvent {
  const item = value as CalendarEvent;
  return !!item && typeof item.externalId === "string" &&
    typeof item.calendar === "string" && typeof item.title === "string" &&
    typeof item.startsAt === "string" && typeof item.endsAt === "string" &&
    typeof item.lastModifiedAt === "string";
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ code: "method_not_allowed" }, 405);
  }
  if (Number(request.headers.get("content-length") ?? 0) > 1_000_000) {
    return json({ code: "payload_too_large" }, 413);
  }
  const token = request.headers.get("authorization")?.replace(
    /^Bearer\s+/i,
    "",
  );
  if (!token) return json({ code: "device_token_missing" }, 401);
  const body = await request.json().catch(() => null) as {
    idempotencyKey?: string;
    reminders?: unknown[];
    events?: unknown[];
  } | null;
  if (
    !body?.idempotencyKey || !Array.isArray(body.reminders) ||
    !Array.isArray(body.events) || !body.reminders.every(validReminder) ||
    !body.events.every(validEvent)
  ) return json({ code: "invalid_payload" }, 400);
  const payloadHash = await digest(JSON.stringify(body));
  const { data, error } = await bridge.rpc("ingest_apple_bridge_snapshot", {
    p_token_hash: await digest(token),
    p_idempotency_key: body.idempotencyKey,
    p_payload_hash: payloadHash,
    p_reminders: body.reminders,
    p_events: body.events,
  });
  if (error || !data) return json({ code: "bridge_ingest_failed" }, 500);
  const outcome = data as {
    code?: string;
    imported?: boolean;
    replay?: boolean;
  };
  if (outcome.code === "device_token_unknown") return json(outcome, 401);
  if (outcome.code === "idempotency_payload_mismatch") {
    return json(outcome, 409);
  }
  return json(outcome, outcome.imported ? 201 : 200);
});
