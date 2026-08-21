import {
  assert,
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  mobileEnvelopeSchema,
  mobileRecordSchema,
} from "./mobile-snapshot-contract.ts";
import { normalizeMobileShortcutEnvelope } from "./mobile-snapshot-compatibility.ts";

function envelope(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schema_version: 1,
    snapshot_id: "30000000-0000-4000-8000-000000000001",
    request_id: "30000000-0000-4000-8000-000000000002",
    client: { type: "ios-shortcut", version: "1.0.0" },
    captured_at: "2026-08-21T09:00:00+01:00",
    sources: [],
    records: [],
    attachments: [],
    ...overrides,
  };
}

function passesCanonicalBoundary(value: unknown): boolean {
  const envelopeResult = mobileEnvelopeSchema.safeParse(value);
  return envelopeResult.success &&
    envelopeResult.data.records.every((record) =>
      mobileRecordSchema.safeParse(record).success
    );
}

Deno.test("normalizes documented Shortcut source-manifest quirks", () => {
  const result = normalizeMobileShortcutEnvelope(envelope({
    sources: [{
      source: " reminders ",
      requested: "true",
      captured: "false",
      captured_at: null,
      record_count: "14",
    }],
  }));
  const parsed = mobileEnvelopeSchema.safeParse(result.value);
  assert(parsed.success);
  assertEquals(parsed.data.sources[0], {
    source: "reminders",
    requested: true,
    captured: false,
    captured_at: null,
    record_count: 14,
    error: null,
  });
  assertEquals(result.changes.map((change) => change.normalization), [
    "trim_identifier",
    "boolean_string_to_boolean",
    "boolean_string_to_boolean",
    "numeric_string_to_integer",
    "missing_error_to_null",
  ]);
});

Deno.test("normalizes empty manifest error to null", () => {
  const result = normalizeMobileShortcutEnvelope(envelope({
    sources: [{
      source: "calendar",
      requested: true,
      captured: true,
      captured_at: null,
      record_count: 0,
      error: "",
    }],
  }));
  assert(mobileEnvelopeSchema.safeParse(result.value).success);
  assertEquals(
    (result.value as { sources: Array<{ error: unknown }> }).sources[0].error,
    null,
  );
  assertEquals(result.changes[0]?.normalization, "empty_error_to_null");
});

Deno.test("trims record source and kind before strict record validation", () => {
  const result = normalizeMobileShortcutEnvelope(envelope({
    records: [{
      record_id: "31000000-0000-4000-8000-000000000001",
      source: " reminders ",
      kind: " reminder\n",
      payload: {},
    }],
  }));
  const records =
    (result.value as { records: Array<Record<string, unknown>> }).records;
  assertEquals(records[0].source, "reminders");
  assertEquals(records[0].kind, "reminder");
  assert(mobileRecordSchema.safeParse(records[0]).success);
});

Deno.test("coerces exact boolean strings only for typed source boolean fields", () => {
  const result = normalizeMobileShortcutEnvelope(envelope({
    records: [{
      record_id: "31000000-0000-4000-8000-000000000001",
      source: "reminders",
      kind: "reminder",
      payload: {
        is_completed: "true",
        is_flagged: "false",
        has_subtasks: "true",
        unrelated: "true",
      },
    }, {
      record_id: "31000000-0000-4000-8000-000000000002",
      source: "calendar",
      kind: "calendar_event",
      payload: { all_day: "false" },
    }],
  }));
  const records = (result.value as {
    records: Array<{ payload: Record<string, unknown> }>;
  }).records;
  assertEquals(records[0].payload, {
    is_completed: true,
    is_flagged: false,
    has_subtasks: true,
    unrelated: "true",
  });
  assertEquals(records[1].payload.all_day, false);
});

Deno.test("does not mutate its input", () => {
  const input = envelope({
    sources: [{
      source: " reminders ",
      requested: "true",
      captured: true,
      captured_at: null,
      record_count: "1",
    }],
  });
  const result = normalizeMobileShortcutEnvelope(input);
  assertNotEquals(result.value, input);
  assertEquals(
    (input.sources as Array<Record<string, unknown>>)[0].source,
    " reminders ",
  );
  assertEquals(
    (input.sources as Array<Record<string, unknown>>)[0].error,
    undefined,
  );
});

Deno.test("diagnostics contain paths and conversion names but no values", () => {
  const result = normalizeMobileShortcutEnvelope(envelope({
    records: [{
      record_id: "31000000-0000-4000-8000-000000000001",
      source: " reminders ",
      kind: "reminder",
      payload: { notes: "sensitive fixture marker" },
    }],
  }));
  const diagnostics = JSON.stringify(result.changes);
  assert(diagnostics.includes("records.0.source"));
  assert(diagnostics.includes("trim_identifier"));
  assert(!diagnostics.includes("sensitive fixture marker"));
  assert(!diagnostics.includes(" reminders "));
});

Deno.test("does not coerce unsupported boolean spellings or unrelated payload booleans", () => {
  const result = normalizeMobileShortcutEnvelope(envelope({
    sources: [{
      source: "reminders",
      requested: "True",
      captured: 1,
      captured_at: null,
      record_count: 1,
      error: null,
    }],
    records: [{
      record_id: "31000000-0000-4000-8000-000000000001",
      source: "health",
      kind: "health_sample",
      payload: { is_completed: "true" },
    }],
  }));
  assert(!mobileEnvelopeSchema.safeParse(result.value).success);
  const value = result.value as {
    sources: Array<Record<string, unknown>>;
    records: Array<{ payload: Record<string, unknown> }>;
  };
  assertEquals(value.sources[0].requested, "True");
  assertEquals(value.sources[0].captured, 1);
  assertEquals(value.records[0].payload.is_completed, "true");
});

Deno.test("does not coerce invalid, signed, decimal, padded, or impossible counts", () => {
  for (const recordCount of ["-1", "1.5", "+1", " 14 ", "2501", -1, 2501]) {
    const result = normalizeMobileShortcutEnvelope(envelope({
      sources: [{
        source: "health",
        requested: true,
        captured: true,
        captured_at: null,
        record_count: recordCount,
        error: null,
      }],
    }));
    assert(
      !mobileEnvelopeSchema.safeParse(result.value).success,
      `Expected count ${String(recordCount)} to be rejected`,
    );
  }
});

Deno.test("trimming does not make malformed identifiers valid", () => {
  for (const source of [" Bad Source ", " reminders! ", " 1calendar ", " "]) {
    const result = normalizeMobileShortcutEnvelope(envelope({
      sources: [{
        source,
        requested: true,
        captured: true,
        captured_at: null,
        record_count: 0,
        error: null,
      }],
    }));
    assert(!passesCanonicalBoundary(result.value));
  }
});

Deno.test("does not parse stringified arrays or dictionaries", () => {
  for (
    const malformed of [
      envelope({ sources: "[]" }),
      envelope({ records: "[]" }),
      envelope({ attachments: "[]" }),
      envelope({ client: '{"type":"ios-shortcut","version":"1.0.0"}' }),
      envelope({
        records: [{
          record_id: "31000000-0000-4000-8000-000000000001",
          source: "reminders",
          kind: "reminder",
          payload: "{}",
        }],
      }),
    ]
  ) {
    const result = normalizeMobileShortcutEnvelope(malformed);
    assert(!passesCanonicalBoundary(result.value));
  }
});

Deno.test("strict schema still rejects invalid dates, versions, objects, and envelope keys", () => {
  const malformed = [
    envelope({ captured_at: "2026-08-21T09:00:00" }),
    envelope({ schema_version: "1" }),
    envelope({ schema_version: 2 }),
    envelope({ sources: [{}] }),
    envelope({ unexpected: true }),
  ];
  for (const candidate of malformed) {
    const result = normalizeMobileShortcutEnvelope(candidate);
    assert(!mobileEnvelopeSchema.safeParse(result.value).success);
  }
});
