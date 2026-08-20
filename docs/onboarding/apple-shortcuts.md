# Apple Shortcuts

The bridge uses only Shortcuts actions exposed by iOS/macOS. It does not use private Apple APIs or
request broad device access.

1. At AAL2, create a bridge device through the `apple-bridge-device` Edge Function with a label and
   the allowed Reminder lists: `Fitness Plan`, `Household & Personal`, and, where needed, `AI Actions`.
2. Copy the returned token immediately. It is displayed once; the service stores only a SHA-256 hash.
3. For the universal collector, POST the versioned JSON envelope to
   `https://epmgvknrydadzitzupzx.supabase.co/functions/v1/mobile-snapshot-ingest` with
   `Authorization: Bearer <device token>`. Keep the token in your private Shortcut and never put it
   inside the JSON, screenshots, logs, or an exported Shortcut.
4. Map only the approved lists. The server silently excludes Reminder lists not enabled for the device.
5. To receive approved actions, call `apple-bridge-actions` with the same token. The endpoint exposes
   only actions in the `AI Actions` list that have already passed approval.
6. Test with a harmless event and reminder, confirm the Personal page shows them, then enable the
   Shortcut automation. Revoke the device in the bridge UI or with `DELETE apple-bridge-device?id=...`
   if the device is lost.

Snapshots are size limited, replay-safe, and cannot mutate Google/Apple source data. A duplicate key
with a different payload is rejected rather than being treated as a valid retry.

## Universal transport smoke test

The initial transport test may use empty `sources`, `records`, and `attachments` arrays. Generate
`snapshot_id` and `request_id` UUIDs once for the logical attempt, and reuse both only when retrying
that same attempt. `captured_at` must be an offset-aware ISO-8601 timestamp; an iPhone-produced
`+01:00` offset is valid and is canonicalised by the server.

```json
{
  "schema_version": 1,
  "snapshot_id": "GENERATED-UUID",
  "request_id": "GENERATED-UUID",
  "client": { "type": "ios-shortcut", "version": "1.0.0" },
  "captured_at": "2026-08-20T12:25:03+01:00",
  "sources": [],
  "records": [],
  "attachments": []
}
```

A new receipt returns HTTP `202` with `status: accepted` and zero summary counts. An identical retry
returns HTTP `200` with `replay: true`. The v1 limits are 8,388,608 request bytes, 32 sources, 2,500
records, 64,000 bytes per record, and 12 nested levels per record. Malformed individual records are
recorded as rejected while valid records in the same envelope remain accepted. Ingestion is passive:
it cannot invoke an agent, send email, enable a schedule, or execute an action.

### Diagnosing a rejected Shortcut request

Every response contains a `diagnostic_id`, also returned in the `x-correlation-id` header. A rejected
request contains `error.stage`, a plain-language `error.message`, and safe structured details. An
`invalid_envelope` response lists every failing field under `error.issues`; each issue includes its
dot-separated `path`, validation `rule`, expected constraint where available, and the received JSON
type. It also includes the complete expected top-level envelope shape. Values, device tokens, and raw
personal payloads are never echoed or logged. Provide the complete response JSON and diagnostic ID
when reporting a failure. Successfully parsed envelopes with rejected individual records include a
bounded `rejected_records` list containing only record indexes, client record IDs, and rejection
reasons.

The exact five-source record payloads and deterministic adapter behaviour are documented in
[`mobile-source-contracts.md`](mobile-source-contracts.md).
