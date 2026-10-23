import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MOBILE_LIMITS } from "./mobile-snapshot.ts";
import {
  mobileEnvelopeSchema,
  mobileRecordSchema,
  mobileReminderV2ScopeSchema,
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

Deno.test("Reminder v2 requires a supported list identity before persistence", () => {
  const record = {
    source: "reminders",
    kind: "reminder",
    payload: { contract_version: 2, list: "Fitness Plan" },
  };
  assert(mobileReminderV2ScopeSchema.safeParse(record).success);
  assertEquals(
    mobileReminderV2ScopeSchema.safeParse({
      ...record,
      payload: { contract_version: 1, list: "Fitness Plan" },
    }).success,
    false,
  );
  assertEquals(
    mobileReminderV2ScopeSchema.safeParse({
      ...record,
      payload: { contract_version: 2 },
    }).success,
    false,
  );
  assertEquals(
    mobileReminderV2ScopeSchema.safeParse({
      ...record,
      payload: { contract_version: 2, list: "Unapproved List" },
    }).success,
    false,
  );
});

Deno.test("non-Reminder v1 records remain valid", () => {
  assert(
    mobileRecordSchema.safeParse({
      record_id: "31000000-0000-4000-8000-000000000099",
      source: "health",
      kind: "health_sample",
      payload: { type: "Steps" },
    }).success,
  );
});

Deno.test("mobile records accept opaque Apple Calendar identifiers", () => {
  assert(
    mobileRecordSchema.safeParse({
      record_id: "Meeting (Personal) — 12 Sept 2026",
      source: "calendar",
      kind: "calendar_event",
      payload: {},
    }).success,
  );
  assertEquals(
    mobileRecordSchema.safeParse({
      record_id: "invalid\u0000id",
      source: "calendar",
      kind: "calendar_event",
      payload: {},
    }).success,
    false,
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

Deno.test("Shortcut documentation scopes the endpoint to its paired Supabase project", async () => {
  const guides = await Promise.all(
    [
      "../../../docs/onboarding/apple-shortcuts.md",
      "../../../docs/onboarding/mobile-source-contracts.md",
    ].map((path) => Deno.readTextFile(new URL(path, import.meta.url))),
  );
  for (const guide of guides) {
    assert(
      guide.includes(
        "<SUPABASE_PROJECT_URL>/functions/v1/mobile-snapshot-ingest",
      ),
    );
    assert(guide.includes("same Supabase project"));
    const absoluteUrls = [...guide.matchAll(/https?:\/\/[^\s`]+/g)].map(
      (match) => {
        try {
          return new URL(match[0]);
        } catch {
          return null;
        }
      },
    );
    assert(
      !absoluteUrls.some(
        (url) =>
          url?.hostname === "epmgvknrydadzitzupzx.supabase.co" &&
          url.pathname === "/functions/v1/mobile-snapshot-ingest",
      ),
    );
  }
});
