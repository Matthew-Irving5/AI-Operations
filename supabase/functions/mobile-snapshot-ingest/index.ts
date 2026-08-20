import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { z } from "https://esm.sh/zod@4.1.5";
import {
  canonicalJson,
  jsonDepth,
  MOBILE_LIMITS,
  sha256Hex,
} from "../_shared/mobile-snapshot.ts";

const bridge = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_ANON_KEY") ?? "",
);
const encoder = new TextEncoder();
const identifier = z.string().regex(/^[a-z][a-z0-9._-]{0,63}$/);
const offsetTimestamp = z.string().max(40).refine(
  (value) =>
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value)),
  "offset-aware timestamp required",
);
const sourceSchema = z.object({
  source: identifier,
  requested: z.boolean(),
  captured: z.boolean(),
  captured_at: offsetTimestamp.nullable(),
  record_count: z.number().int().nonnegative().max(MOBILE_LIMITS.records),
  error: z.string().max(256).nullable(),
}).strict();
const recordSchema = z.object({
  record_id: z.string().uuid(),
  source: identifier,
  kind: identifier,
  external_id: z.string().max(512).nullable().optional(),
  created_at: offsetTimestamp.nullable(),
  modified_at: offsetTimestamp.nullable(),
  payload: z.record(z.string(), z.unknown()),
}).strict();
const envelopeSchema = z.object({
  schema_version: z.literal(1),
  snapshot_id: z.string().uuid(),
  request_id: z.string().uuid(),
  client: z.object({
    type: z.literal("ios-shortcut"),
    version: z.string().min(1).max(32),
  }).strict(),
  captured_at: offsetTimestamp,
  sources: z.array(sourceSchema).max(MOBILE_LIMITS.sources),
  records: z.array(z.unknown()).max(MOBILE_LIMITS.records),
  attachments: z.array(z.never()).length(0),
}).strict();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

function validationReason(
  value: unknown,
  result: z.ZodSafeParseError<unknown>,
): string {
  if (
    encoder.encode(JSON.stringify(value)).byteLength > MOBILE_LIMITS.recordBytes
  ) return "record_too_large";
  if (jsonDepth(value) > MOBILE_LIMITS.nestingDepth) return "record_too_deep";
  const path = result.error.issues[0]?.path.join("_") || "shape";
  return `invalid_${path}`.slice(0, 128);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ code: "method_not_allowed" }, 405);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MOBILE_LIMITS.requestBytes) {
    return json({ code: "payload_too_large" }, 413);
  }

  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)
    ?.[1]?.trim();
  if (!token) return json({ code: "device_token_missing" }, 401);

  const rawBody = await request.text();
  if (encoder.encode(rawBody).byteLength > MOBILE_LIMITS.requestBytes) {
    return json({ code: "payload_too_large" }, 413);
  }
  let rawEnvelope: unknown;
  try {
    rawEnvelope = JSON.parse(rawBody);
  } catch {
    return json({ code: "invalid_json" }, 400);
  }
  if (jsonDepth(rawEnvelope) > MOBILE_LIMITS.nestingDepth + 2) {
    return json({ code: "payload_too_deep" }, 400);
  }

  const parsed = envelopeSchema.safeParse(rawEnvelope);
  if (!parsed.success) {
    const unsupported = typeof rawEnvelope === "object" &&
      rawEnvelope !== null &&
      "schema_version" in rawEnvelope &&
      (rawEnvelope as { schema_version?: unknown }).schema_version !== 1;
    return json({
      code: unsupported ? "unsupported_schema_version" : "invalid_envelope",
    }, 400);
  }
  const envelope = parsed.data;
  if (
    new Set(envelope.sources.map((source) => source.source)).size !==
      envelope.sources.length
  ) {
    return json({ code: "duplicate_source_manifest" }, 400);
  }

  const parsedRecords = await Promise.all(
    envelope.records.map(async (rawRecord) => {
      const result = recordSchema.safeParse(rawRecord);
      const rawHash = await sha256Hex(canonicalJson(rawRecord));
      if (
        !result.success ||
        encoder.encode(JSON.stringify(rawRecord)).byteLength >
          MOBILE_LIMITS.recordBytes ||
        jsonDepth(rawRecord) > MOBILE_LIMITS.nestingDepth
      ) {
        const candidate = typeof rawRecord === "object" && rawRecord !== null
          ? rawRecord as Record<string, unknown>
          : {};
        return {
          record_id: typeof candidate.record_id === "string" &&
              candidate.record_id.length <= 64
            ? candidate.record_id
            : null,
          source: typeof candidate.source === "string" &&
              identifier.safeParse(candidate.source).success
            ? candidate.source
            : null,
          kind: typeof candidate.kind === "string" &&
              identifier.safeParse(candidate.kind).success
            ? candidate.kind
            : null,
          external_id: null,
          source_created_at: null,
          source_modified_at: null,
          canonical_hash: rawHash,
          payload: null,
          raw_record: rawRecord,
          ingest_status: "rejected",
          reject_reason: result.success
            ? (jsonDepth(rawRecord) > MOBILE_LIMITS.nestingDepth
              ? "record_too_deep"
              : "record_too_large")
            : validationReason(rawRecord, result),
        };
      }
      const record = result.data;
      return {
        record_id: record.record_id,
        source: record.source,
        kind: record.kind,
        external_id: record.external_id ?? null,
        source_created_at: record.created_at
          ? new Date(record.created_at).toISOString()
          : null,
        source_modified_at: record.modified_at
          ? new Date(record.modified_at).toISOString()
          : null,
        canonical_hash: await sha256Hex(canonicalJson(record.payload)),
        payload: record.payload,
        raw_record: rawRecord,
        ingest_status: "accepted",
        reject_reason: null,
      };
    }),
  );

  const seenRecordIds = new Set<string>();
  const normalizedRecords = parsedRecords.map((record) => {
    if (record.record_id === null || !seenRecordIds.has(record.record_id)) {
      if (record.record_id !== null) seenRecordIds.add(record.record_id);
      return record;
    }
    return {
      ...record,
      record_id: null,
      ingest_status: "rejected",
      reject_reason: "duplicate_record_id",
    };
  });

  const canonicalEnvelope = canonicalJson(envelope);
  const { data, error } = await bridge.rpc("ingest_mobile_snapshot", {
    p_token_hash: await sha256Hex(token),
    p_schema_version: envelope.schema_version,
    p_snapshot_id: envelope.snapshot_id,
    p_request_id: envelope.request_id,
    p_client_type: envelope.client.type,
    p_client_version: envelope.client.version,
    p_captured_at: new Date(envelope.captured_at).toISOString(),
    p_request_hash: await sha256Hex(canonicalEnvelope),
    p_sources: envelope.sources.map((source) => ({
      ...source,
      captured_at: source.captured_at
        ? new Date(source.captured_at).toISOString()
        : null,
    })),
    p_records: normalizedRecords,
  });
  if (error || !data) return json({ code: "mobile_ingest_failed" }, 500);
  const outcome = data as { code?: string; replay?: boolean };
  if (outcome.code === "device_token_unknown") return json(outcome, 401);
  if (
    outcome.code === "request_id_payload_mismatch" ||
    outcome.code === "snapshot_id_conflict"
  ) return json(outcome, 409);
  if (outcome.code) return json(outcome, 400);
  return json(outcome, outcome.replay ? 200 : 202);
});
