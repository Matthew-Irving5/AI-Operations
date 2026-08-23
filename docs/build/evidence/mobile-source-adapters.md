# Universal mobile source adapter evidence

## Scope

Deterministic `v1` adapters support passive Reminders, Calendar, Health, Location, and Screen Time
records under accepted ADR 0007. The transport envelope and passive no-side-effects boundary are
unchanged.

## Security and persistence

- Every accepted generic record is committed to immutable raw ingestion before adaptation.
- Typed tables retain a restrictive raw-record foreign key and adapter provenance records the name,
  version, outcome, and derived row.
- Typed tables use RLS; authenticated sessions receive read-only AAL2 owner access and cannot insert.
- Screen Time remains lossless text. Health reported values/units remain exact; only explicit
  deterministic type/unit pairs receive separate normalization rows.
- Adapter functions contain no AI, HTTP, workflow, notification, schedule, or action path.
- A concurrency-safe identity registry deduplicates equivalent typed records across daily snapshots
  while retaining every immutable raw receipt and duplicate provenance link.
- Location accepts only JSON numbers or strict decimal strings for latitude, longitude, and altitude;
  both representations normalize into bounded numeric typed columns.

## Limits

The application explicitly enforces 8 MiB per request, 32 sources, 2,500 records, 64,000 bytes per
record, and 12 levels of record nesting. These values support the required five-source Health
collection window without silent truncation.

## Validation

- Deno format, lint, typecheck, and 10 shared/Edge tests passed.
- Full workspace format, lint, typecheck, unit tests, and production build passed.
- Secret scanning passed.
- A synthetic staging request used the public Shortcut contract without optional external identity or
  source timestamps. HTTP returned `202`; five records were received and all five adapted, with zero
  rejected/deferred records. Database verification found five provenance rows and exactly one typed
  row for each source. Synthetic data and credentials were removed immediately afterward.
- Database pgTAP fixtures cover all typed schemas, timestamp/null handling, exact Health/Screen Time
  preservation, explicit normalization, RLS, reprocessing idempotency, malformed adapter payloads,
  raw retention, and absence of workflow/action/notification side effects.
