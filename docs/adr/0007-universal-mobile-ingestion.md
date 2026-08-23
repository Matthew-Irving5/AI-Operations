# ADR 0007: Universal mobile ingestion boundary

## Status

Accepted. Implementation is authorised against this frozen contract. Material
contract changes require this ADR to be amended before implementation diverges.

## Context

AI Operations needs one extensible iOS Shortcut rather than a different
transport contract for each supported Apple data source. iOS is not a generic
extractor: each supported source still needs source-specific Shortcut collection
actions. The transport and backend receipt boundary should remain stable as
collection blocks and backend adapters evolve independently.

The mobile bridge has two conceptually separate jobs:

- passive state capture through `POST /mobile/v1/snapshots`;
- a future, explicit user invocation through `POST /mobile/v1/commands`.

This ADR defines only passive snapshots. Commands must use a separate contract
and threat model.

## Decision

The Shortcut is a collection and upload client. The snapshot endpoint
authenticates the device, validates a versioned envelope, records an immutable
raw receipt, and queues deterministic source adapters. Ingestion and
normalisation never directly invoke an agent or produce external/business side
effects such as sending email, executing actions, or starting schedules.

The boundary is:

```text
iOS Shortcut
  -> authenticated passive snapshot
  -> immutable raw ingestion
  -> validation and deduplication
  -> versioned source adapters
  -> typed state
  -> later policy/agent layer
  -> separately authorised execution layer
```

### Authentication and server authority

- The device token is sent only as `Authorization: Bearer <token>`, never in
  JSON, logs, traces, or persisted plaintext.
- For unattended execution, the plaintext token may be stored only inside the
  operator's private iOS Shortcut. "Never persisted plaintext" applies to the
  backend. A token-bearing Shortcut must not be exported or shared; loss or
  suspected disclosure requires device-token revocation and replacement.
- The server hashes the token and derives the canonical device and user. It does
  not trust a client-supplied device or user identifier.
- Client-reported counts and statuses are observations. The server calculates
  and stores authoritative received, accepted, rejected, and adapted counts.

### Identifier semantics

- `snapshot_id` identifies one logical phone capture. All transport retries of
  that capture reuse it.
- `request_id` is the idempotency identity of one logical HTTP submission. A
  transport retry reuses it. A new submission uses a new value.
- A repeated `request_id` with the same canonical body returns the original
  result. A repeated `request_id` with a different canonical body is rejected.
- Multiple request IDs may refer to the same snapshot only for an explicitly
  supported multi-request delivery flow. Version 1 expects one request per
  snapshot.
- `record_id` is client-generated, required, unique within its snapshot, and
  stable across retries of that snapshot. It is snapshot-scoped and does not
  claim to be either a globally unique ingestion identifier or a stable source
  identity.
- `external_id` is optional and carries a native stable identifier when the
  source exposes one.

### Version 1 envelope

```json
{
  "schema_version": 1,
  "snapshot_id": "uuid",
  "request_id": "uuid",
  "client": {
    "type": "ios-shortcut",
    "version": "1.0.0"
  },
  "captured_at": "2026-08-20T12:25:03Z",
  "sources": [
    {
      "source": "reminders",
      "requested": true,
      "captured": true,
      "captured_at": "2026-08-20T12:25:01Z",
      "record_count": 14,
      "error": null
    }
  ],
  "records": [
    {
      "record_id": "uuid",
      "source": "reminders",
      "kind": "reminder",
      "external_id": "optional-native-id",
      "created_at": null,
      "modified_at": "2026-08-20T10:42:00Z",
      "payload": {
        "title": "Buy milk",
        "completed": false
      }
    }
  ],
  "attachments": []
}
```

`captured_at` is required, offset-aware ISO-8601, and denotes the logical
capture time. The server parses it and canonicalises it to UTC; the client must
not append a false `Z` suffix. Record `created_at` and `modified_at` are
nullable source-provided offset-aware timestamps, not server receipt times. The
server canonicalises supplied timestamps to UTC and records its own
`received_at`.

`source` and `kind` accept future values but must match
`^[a-z][a-z0-9._-]{0,63}$`. Payload must be a JSON object. Client type and
version are bounded strings; the initial client type is `ios-shortcut`.

Version 1 includes top-level `attachments` but requires it to be empty. A later
compatible capability may populate attachment references after a separately
authenticated upload-slot flow exists. Binary content is never Base64-embedded
in snapshot JSON.

### Validation and partial acceptance

Before strict v1 schema validation, the HTTP boundary applies a deterministic,
field-specific iOS Shortcuts compatibility pass. It trims `source` and `kind`,
coerces unsigned decimal `record_count` strings to integers, defaults a missing
or empty source-manifest `error` to `null`, and coerces exact lowercase
`"true"`/`"false"` strings only for fields whose canonical transport or typed
source contract requires booleans. It does not parse stringified
arrays/dictionaries, coerce unrelated record payload values, repair identifiers
or dates, or accept unsupported versions. The normalized result must pass the
unchanged strict canonical v1 schema. Diagnostics record only normalized field
paths and conversion names, never values or payload contents.

For `reminders:v1` only, the native Apple fields `is_completed`, `is_flagged`,
and `has_subtasks` additionally accept exact case-insensitive `"Yes"` and
`"No"`, which normalize to booleans. This rule does not apply to any other
field, source, or approximate spelling.

For `location:v1` only, `latitude`, `longitude`, and `altitude` accept either a
JSON number or a strict decimal string emitted by iOS Shortcuts. The adapter
normalises both representations to database numeric values and still enforces
coordinate bounds. No other location field receives numeric coercion.

Reject the whole request for:

- missing or invalid device authentication;
- invalid JSON or envelope shape;
- unsupported schema version;
- invalid snapshot/request identifiers;
- a replayed request ID with a different canonical body;
- total request, source-count, or record-count limits being exceeded.

For a valid envelope, validate records independently. Malformed records are
recorded as rejected with a bounded reason; valid records in the same snapshot
continue. The response reports partial acceptance. Unknown source/kind values
are accepted into raw storage when their identifiers and payload satisfy the
generic boundary.

Source-adapter validation rejections return deterministic field-level issues to
the authenticated device. Issues identify paths and JSON types; received values
are allowed only for explicitly classified, bounded non-sensitive coercion
fields. Free text, URLs, date contents, and other personal payload values are not
returned or logged.

Limits must exist for total request bytes, number of sources, number of records,
per-record payload bytes, identifier lengths, and nesting depth. Exact initial
limits are implementation constants documented with the API and tested at their
boundaries.

### Raw persistence and provenance

Canonical receipt tables are:

`mobile_snapshots`

- internal `id`, `device_id`, `snapshot_id`, `request_id`, `schema_version`;
- client type/version, captured/received times, canonical request hash, status;
- authoritative summary counts.

`mobile_snapshot_sources`

- snapshot reference and bounded source identifier;
- client-reported requested/captured state, capture time, count, and error;
- server-received/accepted/rejected counts.

`mobile_ingestion_records`

- server-generated globally unique internal `id`, snapshot reference,
  client-generated snapshot-scoped `record_id`, source, kind, external ID;
- source-created/source-modified times, canonical payload hash and payload;
- received time, initial acceptance status, and bounded rejection reason.

`mobile_ingestion_attachments`

- reserved attachment metadata and upload reference; no version 1 rows.

Accepted raw envelope and record fields are append-only/effectively immutable.
Successful adaptation never deletes raw input. Protected retention may expire
raw data later under an explicit, audited retention policy.

Adapter outcomes are separate append-only provenance records rather than a
mutable parser result on the raw row:

`mobile_record_adaptations`

- raw record reference, adapter name/version, run/correlation ID;
- status, bounded error, derived table and row reference, processed time.

Typed rows such as reminders, calendar events, and health samples retain
provenance to the raw record and adapter version that produced them. This
supports deterministic reprocessing after adapter fixes.

### Deduplication

The server canonicalises JSON and calculates content hashes. The Shortcut does
not calculate hashes.

Deduplication is owned by each source adapter in this order when available:

1. native stable identity plus a genuine native change/version marker;
2. native stable identity plus source `modified_at`;
3. source-specific fallback using snapshot record ID and/or canonical content
   hash.

No generic native `version` field is manufactured. Without native identity,
cross-snapshot entity deduplication is inherently best-effort; `record_id` only
guarantees retry stability within one snapshot.

A protected, concurrency-safe typed-deduplication registry maps each resolved
adapter key to its canonical derived row. Later equivalent raw records receive
`duplicate` adaptation provenance pointing to that row. Raw receipts are never
discarded, and historical typed duplicates predating the registry are retained.

### Safety boundary

- Raw ingestion and deterministic adaptation may write protected database state
  but may not directly create external/business side effects.
- Unknown records remain inert until a reviewed adapter and downstream policy
  explicitly support them.
- Model output is never used to validate authentication, establish identity,
  deduplicate raw receipts, or decide whether ingestion itself is accepted.
- Raw payloads are RLS-protected, excluded from ordinary UI/model traces, and
  redacted before any later approved model use.
- iOS permissions and explicit Shortcut configuration are the collection consent
  boundary. The server records submitted source manifests without creating a
  second general consent-management subsystem in version 1.

### Response

The endpoint returns a small machine-readable summary:

```json
{
  "snapshot_id": "uuid",
  "status": "accepted",
  "summary": {
    "received": 42,
    "accepted": 40,
    "rejected": 2,
    "duplicate": 0,
    "deferred": 40
  },
  "sources": [
    {
      "source": "reminders",
      "status": "accepted",
      "received": 17,
      "rejected": 0
    }
  ]
}
```

The Shortcut displays only a concise success/failure summary. It is not a sync
administration UI.

## Consequences

- Adding a supported source requires a Shortcut collection block and normally a
  versioned backend adapter, but no transport-envelope redesign.
- Adapter bugs can be repaired and raw records deterministically reprocessed.
- Flexible ingestion remains passive and cannot silently become execution.
- Raw storage increases privacy, retention, and cost obligations; limits,
  encryption/RLS, redaction, and explicit retention policy are mandatory.
- Attachment binaries and active mobile commands require separate follow-up
  decisions before implementation.
