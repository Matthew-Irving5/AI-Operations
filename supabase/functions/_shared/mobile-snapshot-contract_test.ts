import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MOBILE_LIMITS } from "./mobile-snapshot.ts";
import {
  mobileEnvelopeSchema,
  mobileRecordSchema,
} from "./mobile-snapshot-contract.ts";

Deno.test("mobile records do not require optional Apple identity timestamps", () => {
  assert(
    mobileRecordSchema.safeParse({
      record_id: "31000000-0000-4000-8000-000000000001",
      source: "reminders",
      kind: "reminder",
      payload: {},
    }).success,
  );
});

Deno.test("mobile transport limits support health collection windows", () => {
  assertEquals(MOBILE_LIMITS.requestBytes, 8_388_608);
  assert(MOBILE_LIMITS.records >= 2_000);
  assert(MOBILE_LIMITS.recordBytes >= 16 * 1024);
  assert(MOBILE_LIMITS.sources >= 5);
});

Deno.test("empty five-source transport arrays remain valid", () => {
  assert(
    mobileEnvelopeSchema.safeParse({
      schema_version: 1,
      snapshot_id: "30000000-0000-4000-8000-000000000001",
      request_id: "30000000-0000-4000-8000-000000000002",
      client: { type: "ios-shortcut", version: "1.0.0" },
      captured_at: "2026-08-20T12:00:00+01:00",
      sources: [],
      records: [],
      attachments: [],
    }).success,
  );
});
