import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { z } from "https://esm.sh/zod@4.1.5";
import {
  mobileEnvelopeSchema,
  mobileIdentifier,
  mobileRecordSchema,
} from "../_shared/mobile-snapshot-contract.ts";
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

const json = (body: unknown, status = 200, diagnosticId?: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(diagnosticId ? { "x-correlation-id": diagnosticId } : {}),
    },
  });

type DiagnosticIssue = {
  path: string;
  rule: string;
  message: string;
  expected?: string;
  received_type: string;
  unexpected_keys?: string[];
};

const expectedEnvelope = {
  schema_version: "number, exactly 1",
  snapshot_id: "UUID string",
  request_id: "UUID string",
  client: '{ type: "ios-shortcut", version: "1.0.0" }',
  captured_at: "offset-aware ISO-8601 string ending Z or +/-HH:MM",
  sources: "array (empty array is valid)",
  records: "array (empty array is valid)",
  attachments: "empty array in schema version 1",
} as const;

function jsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function valueAtPath(root: unknown, path: PropertyKey[]): unknown {
  let current = root;
  for (const segment of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<PropertyKey, unknown>)[segment];
  }
  return current;
}

function diagnosticIssues(
  root: unknown,
  issues: z.core.$ZodIssue[],
): DiagnosticIssue[] {
  return issues.slice(0, 20).map((issue) => {
    const details = issue as z.core.$ZodIssue & {
      expected?: unknown;
      keys?: PropertyKey[];
    };
    return {
      path: issue.path.length === 0 ? "$" : issue.path.map(String).join("."),
      rule: issue.code,
      message: issue.message,
      ...(details.expected === undefined
        ? {}
        : { expected: String(details.expected) }),
      received_type: jsonType(valueAtPath(root, issue.path)),
      ...(details.keys
        ? { unexpected_keys: details.keys.map(String).slice(0, 20) }
        : {}),
    };
  });
}

function errorResponse(
  diagnosticId: string,
  status: number,
  code: string,
  stage: string,
  message: string,
  details?: Record<string, unknown>,
): Response {
  console.error(
    JSON.stringify({ diagnostic_id: diagnosticId, status, code, stage }),
  );
  return json(
    {
      ok: false,
      code,
      diagnostic_id: diagnosticId,
      error: { stage, message, ...details },
    },
    status,
    diagnosticId,
  );
}

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
  const diagnosticId = crypto.randomUUID();
  if (request.method !== "POST") {
    return errorResponse(
      diagnosticId,
      405,
      "method_not_allowed",
      "http_method",
      `Expected POST but received ${request.method}.`,
      { expected: "POST", received: request.method },
    );
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MOBILE_LIMITS.requestBytes) {
    return errorResponse(
      diagnosticId,
      413,
      "payload_too_large",
      "request_size",
      "The request exceeds the maximum transport size.",
      {
        maximum_bytes: MOBILE_LIMITS.requestBytes,
        received_bytes: declaredLength,
      },
    );
  }

  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)
    ?.[1]?.trim();
  if (!token) {
    return errorResponse(
      diagnosticId,
      401,
      "device_token_missing",
      "authentication_header",
      "The Authorization header is missing or is not in Bearer token format.",
      { expected_header: "Authorization: Bearer <DEVICE_TOKEN>" },
    );
  }

  const rawBody = await request.text();
  if (encoder.encode(rawBody).byteLength > MOBILE_LIMITS.requestBytes) {
    return errorResponse(
      diagnosticId,
      413,
      "payload_too_large",
      "request_size",
      "The decoded request body exceeds the maximum transport size.",
      {
        maximum_bytes: MOBILE_LIMITS.requestBytes,
        received_bytes: encoder.encode(rawBody).byteLength,
      },
    );
  }
  let rawEnvelope: unknown;
  try {
    rawEnvelope = JSON.parse(rawBody);
  } catch (error) {
    return errorResponse(
      diagnosticId,
      400,
      "invalid_json",
      "json_parse",
      "The request body is not valid JSON. In Shortcuts, set Request Body to JSON and pass one Dictionary.",
      {
        content_type: request.headers.get("content-type") ?? "missing",
        received_bytes: encoder.encode(rawBody).byteLength,
        parser_message: error instanceof SyntaxError
          ? error.message.slice(0, 200)
          : "JSON parsing failed",
      },
    );
  }
  if (jsonDepth(rawEnvelope) > MOBILE_LIMITS.nestingDepth + 2) {
    return errorResponse(
      diagnosticId,
      400,
      "payload_too_deep",
      "envelope_depth",
      "The JSON nesting depth exceeds the transport limit.",
      {
        maximum_depth: MOBILE_LIMITS.nestingDepth + 2,
        received_depth: jsonDepth(rawEnvelope),
      },
    );
  }

  const parsed = mobileEnvelopeSchema.safeParse(rawEnvelope);
  if (!parsed.success) {
    const unsupported = typeof rawEnvelope === "object" &&
      rawEnvelope !== null &&
      "schema_version" in rawEnvelope &&
      (rawEnvelope as { schema_version?: unknown }).schema_version !== 1;
    return errorResponse(
      diagnosticId,
      400,
      unsupported ? "unsupported_schema_version" : "invalid_envelope",
      "envelope_validation",
      "The top-level Shortcut dictionary does not match the mobile snapshot v1 contract. Review every issue path below.",
      {
        issues: diagnosticIssues(rawEnvelope, parsed.error.issues),
        issue_count: parsed.error.issues.length,
        expected_envelope: expectedEnvelope,
      },
    );
  }
  const envelope = parsed.data;
  if (
    new Set(envelope.sources.map((source) => source.source)).size !==
      envelope.sources.length
  ) {
    return errorResponse(
      diagnosticId,
      400,
      "duplicate_source_manifest",
      "source_manifest_validation",
      "Each source name may appear only once in the sources array.",
    );
  }

  const parsedRecords = await Promise.all(
    envelope.records.map(async (rawRecord) => {
      const result = mobileRecordSchema.safeParse(rawRecord);
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
              mobileIdentifier.safeParse(candidate.source).success
            ? candidate.source
            : null,
          kind: typeof candidate.kind === "string" &&
              mobileIdentifier.safeParse(candidate.kind).success
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
  const rejectedRecords = normalizedRecords.flatMap((record, index) =>
    record.ingest_status === "rejected"
      ? [{
        index,
        record_id: record.record_id,
        reason: record.reject_reason,
      }]
      : []
  );

  const canonicalEnvelope = canonicalJson(envelope);
  const tokenHash = await sha256Hex(token);
  const { data, error } = await bridge.rpc("ingest_mobile_snapshot", {
    p_token_hash: tokenHash,
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
  if (error || !data) {
    return errorResponse(
      diagnosticId,
      500,
      "mobile_ingest_failed",
      "database_persistence",
      "The envelope passed HTTP validation but could not be persisted.",
      {
        provider_code: error?.code ?? "missing_rpc_result",
        provider_message: error?.message?.slice(0, 300) ??
          "The database returned no result.",
      },
    );
  }
  const outcome = data as {
    code?: string;
    replay?: boolean;
    status?: string;
    summary?: Record<string, unknown>;
  };
  if (outcome.code === "device_token_unknown") {
    return errorResponse(
      diagnosticId,
      401,
      outcome.code,
      "device_authentication",
      "The bearer token did not match an active Apple bridge device. Generate or copy the device token again.",
    );
  }
  if (
    outcome.code === "request_id_payload_mismatch" ||
    outcome.code === "snapshot_id_conflict"
  ) {
    return errorResponse(
      diagnosticId,
      409,
      outcome.code,
      "idempotency_validation",
      outcome.code === "request_id_payload_mismatch"
        ? "This request_id was already used with a different body. Generate a new request_id for a new submission."
        : "This snapshot_id was already used by another request. Generate a new snapshot_id for a new capture.",
    );
  }
  if (outcome.code) {
    return errorResponse(
      diagnosticId,
      400,
      outcome.code,
      "database_contract_validation",
      `The database contract rejected the request with code ${outcome.code}.`,
    );
  }
  const { data: adaptationData, error: adaptationError } = await bridge.rpc(
    "adapt_mobile_snapshot",
    { p_token_hash: tokenHash, p_snapshot_id: envelope.snapshot_id },
  );
  if (adaptationError || !adaptationData) {
    return errorResponse(
      diagnosticId,
      500,
      "mobile_adaptation_failed",
      "deterministic_adaptation",
      "The immutable raw snapshot was stored, but deterministic source adaptation did not complete. Retry with the same snapshot_id and request_id.",
      {
        raw_snapshot_persisted: true,
        retry_with_same_identifiers: true,
        provider_code: adaptationError?.code ?? "missing_adapter_result",
        provider_message: adaptationError?.message?.slice(0, 300) ??
          "The adapter returned no result.",
      },
    );
  }
  const adaptation = adaptationData as {
    code?: string;
    status: string;
    adapted: number;
    duplicate: number;
    rejected: number;
    deferred: number;
    rejections: Array<{
      record_id: string;
      adapter: string;
      reason: string;
    }>;
  };
  if (adaptation.code) {
    return errorResponse(
      diagnosticId,
      500,
      adaptation.code,
      "deterministic_adaptation",
      "The immutable raw snapshot was stored, but the adapter could not locate its authenticated snapshot context. Retry with the same identifiers.",
      { raw_snapshot_persisted: true, retry_with_same_identifiers: true },
    );
  }
  return json(
    {
      ...outcome,
      status: adaptation.rejected > 0 ? "partial" : outcome.status,
      summary: {
        ...outcome.summary,
        deferred: adaptation.deferred,
      },
      adaptation,
      diagnostic_id: diagnosticId,
      ...(rejectedRecords.length > 0
        ? { rejected_records: rejectedRecords }
        : {}),
    },
    outcome.replay ? 200 : 202,
    diagnosticId,
  );
});
