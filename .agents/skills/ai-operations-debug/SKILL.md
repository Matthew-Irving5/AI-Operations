---
name: ai-operations-debug
description: Localise failing AI Operations tests, CI and staging defects with narrow evidence and causal regressions instead of speculative patches.
---

# Narrow causal debugging

1. Capture the first useful error, actual vs expected state, relevant role/fixture, failing boundary and exact reproduction. Redact secrets and personal data.
2. Classify CODE, CONTRACT, ENVIRONMENT, INFRASTRUCTURE, FLAKE or UNKNOWN. Environment → qa:doctor; CI → gh run view --log-failed; use qa:debug for sanitized local evidence.
3. Trace the producing and consuming symbols; inspect RPC/column grants, fixture state and evidence producer → schema → consumer when implicated. A 404 can conceal a DB permission error.
4. Build or run the cheapest reproduction _before_ fixing. Patch the causal defect, rerun the same test. After two failed hypotheses, reset the diagnosis.
5. Add an earlier regression/diagnostic for deterministic staging escapes. For confirmed integration or infrastructure causes, apply `ai-operations-integrate` and update the living rule plus evidence-linked failure ledger **in this fix commit**, not in a later documentation pass. Then run corepack pnpm verify:changed. Staging is not a debugger.
   Return proof, fix, narrow command, regression result and genuine blockers. Never weaken MFA or change tests to disguise failure.
