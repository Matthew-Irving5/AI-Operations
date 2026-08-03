# Health export

Health uses Apple Health as the canonical source. Configure Health Auto Export (or an equivalent
official exporter) to send the complete previous London calendar day, including source/device IDs,
stable record IDs, unit, value, timestamp, revision and deletion information.

1. Configure the private endpoint `health-ingest` with its `x-health-ingest-secret` header.
2. Send JSON payloads below 5 MB with a unique idempotency key. Split a historical backfill into
   chronological chunks; retry the same chunk with the same key.
3. The endpoint archives the exact raw payload through the private archive gateway before it writes
   normalised samples. If archiving is unavailable, the import fails closed.
4. Include all authorised categories available from the exporter: workouts, distance, steps, active
   energy, exercise minutes, heart metrics, sleep, oxygen saturation, body composition, nutrition,
   water, pace/cadence/elevation, cardio fitness and mobility metrics.
5. Keep the daily late-write recheck enabled so revised Apple Health records are sent again. Never
   use a private Apple API or unsupported Screen Time entitlement.

Screen Time is experimental and disabled by default. A manual JSON/CSV import may be configured only
when an official export is available. Health reports are not diagnosis, treatment, or medical advice.
