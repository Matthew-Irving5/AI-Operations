# Passive mobile source contracts

The universal iOS Shortcut sends all passive records to
`https://epmgvknrydadzitzupzx.supabase.co/functions/v1/mobile-snapshot-ingest` using the ADR 0007
envelope. Authentication remains `Authorization: Bearer <DEVICE_TOKEN>`; never put the token in the
JSON or an exported Shortcut.

Every record requires only a snapshot-scoped UUID `record_id`, its `source`, its `kind`, and a
`payload` dictionary. `external_id`, `created_at`, and `modified_at` are optional. The server hashes
canonical payloads. The Shortcut must not calculate hashes.

## Supported version 1 records

| Logical adapter  | Source        | Kind                   | Payload fields                                                                                               |
| ---------------- | ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `reminders:v1`   | `reminders`   | `reminder`             | `title`, `notes`, `priority`, `is_completed`, `is_flagged`, `due_at`, `completion_at`, `url`, `has_subtasks` |
| `calendar:v1`    | `calendar`    | `calendar_event`       | `title`, `start_at`, `end_at`, `all_day`, `calendar`, `location`, `notes`, `url`                             |
| `health:v1`      | `health`      | `health_sample`        | `type`, `value`, `unit`, `start_at`, `end_at`, `duration`, `source_name`, `name`                             |
| `location:v1`    | `location`    | `location_observation` | `latitude`, `longitude`, `altitude`, `name`, `street`, `city`, `state`, `postcode`, `region`                 |
| `screen_time:v1` | `screen_time` | `app_website_activity` | `raw_text`                                                                                                   |

All listed payload fields are required so a missing Shortcuts mapping is visible as a per-record
adapter rejection. Empty strings are valid for optional Apple values represented as strings.
Reminder `due_at` and `completion_at` specifically normalise from `""` to database `null`.
Calendar and Health timestamps must be offset-aware ISO-8601 values.

Health accepts a string or JSON number for `value` and preserves both the value representation and
reported unit exactly. A separate deterministic `v1` normalisation records a canonical value only
for an explicit recognised type/unit pair. Unknown types, units, and non-numeric Sleep categories
remain safely deferred; they are never guessed. The initial collection types are Steps, Heart Rate,
Resting Heart Rate, Heart Rate Variability (SDNN), Sleep, Active Energy, Walking + Running Distance,
Exercise Minutes, and Weight.

Location stores only the supplied coordinates, altitude, and place/address strings. It does not
invent accuracy. Screen Time stores each Shortcuts text representation losslessly and does not use an
LLM or infer fields.

## Limits

- Request body: 8 MiB (`8,388,608` bytes)
- Sources: 32 (the initial Shortcut uses five)
- Records per snapshot: 2,500
- Payload per record: 64,000 bytes
- Record JSON nesting: 12 levels

Requests over an envelope limit fail as a whole with structured diagnostics; records are never
silently truncated. A record over its individual size/depth limit is retained as a rejected raw
record while valid siblings continue.

## Persistence and safety

The endpoint first commits the immutable raw snapshot and then runs deterministic adapters. Every
adapter outcome records `adapter_name`, `adapter_version`, status, and derived-row provenance in
`mobile_record_adaptations`. Re-running the same version is idempotent and never changes the raw
record. If adaptation cannot run after raw persistence, the endpoint returns
`mobile_adaptation_failed`, confirms `raw_snapshot_persisted: true`, and instructs the client to retry
with the same snapshot and request IDs.

Ingestion and adaptation do not invoke AI, create workflows or actions, send notifications, enable
schedules, or call external services. Unknown source/kind pairs remain inert and deferred.
