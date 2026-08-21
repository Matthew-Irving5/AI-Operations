# Mobile Shortcut compatibility normalisation evidence

## Scope

The `mobile-snapshot-ingest` HTTP boundary now applies a deterministic, narrow
iOS Shortcuts compatibility pass before the unchanged strict v1 envelope and
record schemas. Supported conversions are recorded by field path and conversion
name without values or payload content.

## Safety properties

- Only documented identifier trimming, numeric manifest count conversion,
  manifest error defaults, and explicit boolean fields are normalized.
- Stringified arrays/dictionaries, malformed identifiers, invalid dates,
  unsupported versions, impossible counts, and unrelated payload values remain
  invalid or unchanged.
- The normalized envelope is the input to canonical hashing and immutable raw
  ingestion, so equivalent Shortcut/canonical retries retain one idempotency
  identity.
- Compatibility processing does not invoke AI or produce external/business
  side effects.

## Validation

- Full Edge Function format, lint, typecheck, and test workflow: passed.
- Compatibility boundary tests: 10 passed.
- Complete shared Edge Function tests: 20 passed.
- Repository `pnpm verify`: passed.
