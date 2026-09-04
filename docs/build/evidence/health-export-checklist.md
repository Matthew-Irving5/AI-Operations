# Health exporter checklist evidence

## Accepted operator scope

- The signed AI Operations Apple Shortcut is the supported exporter.
- The operator explicitly accepted the already-retained mobile history as initial history and
  waived a separate historical file export.
- Authorised available categories are Steps, Heart Rate, optional Resting Heart Rate, Sleep, Active
  Calories, Walking + Running Distance, and Weight.
- Heart Rate Variability and Exercise Minutes are omitted because Apple Health currently has no
  samples for them; an empty optional category must never block the remaining export.

## Production collection evidence

On 2026-09-04 at 15:04:46 Europe/London, production accepted one authenticated snapshot containing
510 records with zero transport or adapter rejections: Calendar 36, Health 384, Location 1,
Reminders 30, and Screen Time 59. Health contained all currently available required categories;
Resting Heart Rate was correctly absent for that collection window. Numeric categories normalized
successfully and non-numeric Sleep values were retained without guessed conversion.

## Canonical processing implemented

- Every successful universal mobile snapshot promotes normalized Health records into an idempotent
  `health_imports` bundle and canonical `health_samples` rows.
- Affected Europe/London days are recalculated deterministically in `health_daily_summaries`.
- The latest successful collection updates `data_freshness` for `apple_health`.
- The immutable mobile snapshot and raw records remain the retained pre-transformation evidence.
- The Health page exposes import, canonical sample, rejection, summary, completeness, confidence,
  and freshness evidence needed for operator verification.

## Validation

- Staging migration applied successfully.
- Public promotion requires the active device token hash and matching snapshot ownership.
- Internal promotion is not executable by `anon` or `authenticated`.
- Promotion is idempotent across snapshot retries and overlapping collection windows.
- Web TypeScript, unit tests, lint, and production build pass.
- Edge Function formatting and type checking pass.
