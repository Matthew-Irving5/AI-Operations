import { z } from "https://esm.sh/zod@4.1.5";
import { MOBILE_LIMITS } from "./mobile-snapshot.ts";

export const mobileIdentifier = z.string().regex(/^[a-z][a-z0-9._-]{0,63}$/);
export const mobileOffsetTimestamp = z.string().max(40).refine(
  (value) =>
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value)),
  "offset-aware timestamp required",
);
export const mobileSourceSchema = z.object({
  source: mobileIdentifier,
  requested: z.boolean(),
  captured: z.boolean(),
  captured_at: mobileOffsetTimestamp.nullable(),
  record_count: z.number().int().nonnegative().max(MOBILE_LIMITS.records),
  error: z.string().max(256).nullable(),
}).strict();
export const mobileRecordSchema = z.object({
  record_id: z.string().uuid(),
  source: mobileIdentifier,
  kind: mobileIdentifier,
  external_id: z.string().max(512).nullable().optional(),
  created_at: mobileOffsetTimestamp.nullable().optional(),
  modified_at: mobileOffsetTimestamp.nullable().optional(),
  payload: z.record(z.string(), z.unknown()),
}).strict();
export const mobileEnvelopeSchema = z.object({
  schema_version: z.literal(1),
  snapshot_id: z.string().uuid(),
  request_id: z.string().uuid(),
  client: z.object({
    type: z.literal("ios-shortcut"),
    version: z.string().min(1).max(32),
  }).strict(),
  captured_at: mobileOffsetTimestamp,
  sources: z.array(mobileSourceSchema).max(MOBILE_LIMITS.sources),
  records: z.array(z.unknown()).max(MOBILE_LIMITS.records),
  attachments: z.array(z.never()).length(0),
}).strict();
