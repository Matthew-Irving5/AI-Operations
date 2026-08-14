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
  const tokenHash = await digest(token);
  const device = await service.from("apple_bridge_devices").select(
    "id,user_id,enabled_lists,revoked_at",
  ).eq("token_hash", tokenHash).maybeSingle();
  if (device.error) return json({ code: "device_lookup_failed" }, 500);
  if (!device.data) return json({ code: "device_token_unknown" }, 401);
  if (device.data.revoked_at) {
    return json({ code: "device_token_revoked" }, 401);
  }
  const deviceData = device.data;
  const payloadHash = await digest(JSON.stringify(body));
  const receipt = await service.from("apple_bridge_receipts").insert({
    device_id: deviceData.id,
    idempotency_key: body.idempotencyKey,
    payload_hash: payloadHash,
  });
  if (receipt.error?.code === "23505") {
    const previous = await service.from("apple_bridge_receipts").select(
      "payload_hash",
    )
      .eq("device_id", deviceData.id).eq(
        "idempotency_key",
        body.idempotencyKey,
      ).maybeSingle();
    if (previous.data?.payload_hash !== payloadHash) {
      return json({ code: "idempotency_payload_mismatch" }, 409);
    }
    return json({ imported: false, replay: true });
  }
  if (receipt.error) return json({ code: "receipt_failed" }, 500);
  const enabled = new Set(deviceData.enabled_lists);
  const reminders = body.reminders.filter((item) => enabled.has(item.list));
  const reminderRows = reminders.map((item) => ({
    user_id: deviceData.user_id,
    source: "apple",
    list_name: item.list,
    external_id: item.externalId,
    title: item.title,
    notes: item.notes ?? null,
    due_at: item.dueAt ?? null,
    completed_at: item.completedAt ?? null,
    recurrence_rule: item.recurrence ?? null,
    priority: item.priority ?? 0,
    last_modified_at: item.lastModifiedAt,
    payload_hash: payloadHash,
  }));
  const eventRows = body.events.map((item) => ({
    user_id: deviceData.user_id,
    source: "apple",
    calendar_external_id: item.calendar,
    external_id: item.externalId,
    title: item.title,
    starts_at: item.startsAt,
    ends_at: item.endsAt,
    source_timezone: "Europe/London",
    all_day: item.allDay ?? false,
    location_reference: item.location ?? null,
    notes: item.notes ?? null,
    recurrence_rule: item.recurrence ?? null,
    status: item.status ?? "confirmed",
    last_modified_at: item.lastModifiedAt,
    payload_hash: payloadHash,
  }));
  const [reminderResult, eventResult] = await Promise.all([
    reminderRows.length
      ? service.from("reminders").upsert(reminderRows, {
        onConflict: "user_id,source,external_id",
      })
      : Promise.resolve({ error: null }),
    eventRows.length
      ? service.from("calendar_events").upsert(eventRows, {
        onConflict: "user_id,source,calendar_external_id,external_id",
      })
      : Promise.resolve({ error: null }),
  ]);
  if (reminderResult.error || eventResult.error) {
    return json({ code: "import_failed" }, 500);
  }
  await service.from("apple_bridge_devices").update({
    last_seen_at: new Date().toISOString(),
  }).eq("id", deviceData.id);
  return json({
    imported: true,
    reminders: reminderRows.length,
    events: eventRows.length,
  }, 201);
});
