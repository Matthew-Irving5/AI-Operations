# Cost controls

Every AI call must have a deterministic pre-call estimate and a persisted reservation before provider invocation. Recurring work uses the month-level target of $5.00 and hard cap of $10.00 by default. The hard cap is enforced by the `reserve_recurring_budget` database function with outstanding reservations included; no browser client can bypass it.

On-demand work is separate: a user supplies a per-run hard cap, model ceiling, and search ceiling. It is excluded from recurring-cap enforcement but retained in combined actual and forecast reporting.

Pricing is versioned in `model_pricing`, sourced from the official OpenAI model comparison page, and historical calculations use the stored call/price record. GPT-5.6 Luna, Terra, and Sol are seeded at standard API prices. Model output cannot alter target or hard-cap values.

Forecast snapshots record actual completed spend, expected completed spend, original recurring estimate, bounded variance factor, adjusted month-end forecast, and confidence. The variance factor is limited to 0.5–3.0.

At runtime, jobs retry with exponential backoff plus jitter and move to dead letter after their configured maximum attempts. A hard-cap rejection never retries into a higher cap.

Provider reconciliation never overwrites recorded call costs or historical price versions. It records the provider-reported period total alongside the deterministic calculated total and marks material differences for investigation. Adding or changing a price version requires a fresh TOTP event from the allowlisted user.
