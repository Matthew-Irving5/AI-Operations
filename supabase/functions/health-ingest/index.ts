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
const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
type Sample = {
  externalId: string;
  metric: string;
  observedAt: string;
  value: number;
  unit: string;
  deviceName?: string;
  deletedAt?: string;
  revision?: number;
};
type Payload = {
  idempotencyKey: string;
  collectedFrom: string;
  collectedTo: string;
  deviceName?: string;
  samples: Sample[];
};
const validSample = (sample: unknown): sample is Sample => {
  const value = sample as Sample;
  return !!value && typeof value.externalId === "string" &&
    value.externalId.length <= 200 &&
    typeof value.metric === "string" &&
    /^[a-z0-9_]{1,80}$/.test(value.metric) &&
    typeof value.observedAt === "string" &&
    !Number.isNaN(Date.parse(value.observedAt)) &&
    typeof value.value === "number" && Number.isFinite(value.value) &&
    typeof value.unit === "string" && value.unit.length <= 24 &&
    (value.revision === undefined ||
      Number.isInteger(value.revision) && value.revision > 0);
};

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ code: "method_not_allowed" }, 405);
  }
  if (
    request.headers.get("x-health-ingest-secret") !==
      Deno.env.get("HEALTH_INGEST_SECRET")
  ) {
    return json({ code: "unauthorised" }, 401);
  }
  if (Number(request.headers.get("content-length") ?? 0) > 5_000_000) {
    return json({ code: "payload_too_large" }, 413);
  }
  const raw = await request.text();
  let body: Payload | null;
  try {
    body = JSON.parse(raw) as Payload;
  } catch {
    return json({ code: "invalid_payload" }, 400);
  }
  if (
    !body?.idempotencyKey ||
    !/^[a-zA-Z0-9:_-]{8,128}$/.test(body.idempotencyKey) ||
    !Array.isArray(body.samples) || body.samples.length > 10_000 ||
    !body.samples.every(validSample) ||
    Number.isNaN(Date.parse(body.collectedFrom)) ||
    Number.isNaN(Date.parse(body.collectedTo))
  ) {
    return json({ code: "invalid_payload" }, 400);
  }
  const archiveUrl = Deno.env.get("HEALTH_ARCHIVE_GATEWAY_URL");
  const archiveSecret = Deno.env.get("HEALTH_ARCHIVE_GATEWAY_SECRET");
  if (!archiveUrl || !archiveSecret) {
    return json({ code: "archive_unconfigured" }, 503);
  }
  const digest = await hash(raw);
  const archived = await fetch(archiveUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-archive-secret": archiveSecret,
      "x-content-sha256": digest,
    },
    body: raw,
  });
  const archive = await archived.json().catch(() => null) as {
    key?: string;
    bytes?: number;
  } | null;
  if (!archived.ok || !archive?.key || typeof archive.bytes !== "number") {
    return json({ code: "archive_failed" }, 502);
  }
  const user = await service.from("app_users").select("id").eq(
    "email",
    "matthewirving99@gmail.com",
  ).maybeSingle();
  if (!user.data) return json({ code: "allowed_user_missing" }, 500);
  const object = await service.from("source_objects").insert({
    user_id: user.data.id,
    r2_key: archive.key,
    sha256: digest,
    size_bytes: archive.bytes,
    mime_type: "application/json",
    data_classification: "highly_sensitive",
    source: "apple_health",
    captured_at: new Date().toISOString(),
  }).select("id").single();
  if (object.error || !object.data) {
    return json({ code: "archive_metadata_failed" }, 500);
  }
  const imported = await service.from("health_imports").insert({
    user_id: user.data.id,
    source: "apple_health",
    idempotency_key: body.idempotencyKey,
    payload_sha256: digest,
    source_object_id: object.data.id,
    device_name: body.deviceName ?? null,
    collected_from: body.collectedFrom,
    collected_to: body.collectedTo,
  }).select("id").single();
  if (imported.error?.code === "23505") {
    return json({ imported: false, replay: true });
  }
  if (imported.error || !imported.data) {
    return json({ code: "import_create_failed" }, 500);
  }
  const rows = body.samples.map((sample) => ({
    user_id: user.data!.id,
    import_id: imported.data.id,
    source: "apple_health",
    external_id: sample.externalId,
    metric: sample.metric,
    observed_at: sample.observedAt,
    value: sample.value,
    unit: sample.unit,
    original_value: sample.value,
    original_unit: sample.unit,
    device_name: sample.deviceName ?? body.deviceName ?? null,
    revision: sample.revision ?? 1,
    deleted_at: sample.deletedAt ?? null,
  }));
  const stored = rows.length
    ? await service.from("health_samples").upsert(rows, {
      onConflict: "user_id,source,external_id,revision",
    })
    : { error: null };
  if (stored.error) return json({ code: "sample_store_failed" }, 500);
  await service.from("health_imports").update({ status: "processed" }).eq(
    "id",
    imported.data.id,
  );
  await service.from("data_freshness").upsert({
    user_id: user.data.id,
    source: "apple_health",
    last_source_at: body.collectedTo,
    last_success_at: new Date().toISOString(),
    expected_cadence: "24 hours",
    state: "fresh",
  }, { onConflict: "user_id,source" });
  return json({
    imported: true,
    importId: imported.data.id,
    samples: rows.length,
  }, 201);
});
