# Health export

Health uses Apple Health as the canonical source. The AI Operations Apple Shortcut is the supported
equivalent exporter for the operator's available categories. It sends a rolling late-write window
with source, unit, value, timestamp, and deterministic record identity through the authenticated
universal mobile snapshot endpoint.

The universal endpoint retains the immutable raw snapshot before deterministic typed adaptation,
promotes recognized numeric measurements into canonical `health_samples`, recalculates affected
London-date summaries, and updates `apple_health` freshness. Replays and overlapping daily windows
remain idempotent.

For initial setup, the retained mobile history may be accepted as the initial history when the
operator explicitly waives a separate full export. This does not claim coverage before the first
retained snapshot.

1. Install the signed Apple Shortcut with its device-scoped bearer token and enable its daily
   automation after a successful manual run.
2. Keep the rolling two-day late-write window. A retry uses the same snapshot/request IDs; a new run
   generates new IDs.
3. Collect the authorised categories available on the operator's phone: Steps, Heart Rate, optional
   Resting Heart Rate, Sleep, Active Calories, Walking + Running Distance, and Weight. Empty optional
   categories must not block other queries.
4. In Health, verify imported bundles, canonical samples, rejected records, daily summaries, and a
   fresh `apple_health` status. Completeness is evidence, not a medical-quality score.
5. Never use a private Apple API or unsupported Screen Time entitlement.

The separate `health-ingest` endpoint remains available for future official bulk exporters and
requires its private archive gateway. It is not required for the supported Shortcut path.

Screen Time is experimental and disabled by default. A manual JSON/CSV import may be configured only
when an official export is available. Health reports are not diagnosis, treatment, or medical advice.
