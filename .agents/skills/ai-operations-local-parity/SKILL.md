---
name: ai-operations-local-parity
description: Historical compatibility alias; canonical local integration, permissions and Cloudflare rules live in ai-operations-integrate.
---

# Compatibility alias

- **Do not load both skills.** Use `ai-operations-integrate` as the single concise source for Supabase/Edge/Cloudflare/GitHub boundaries.
- The read-only catalog is `docs/testing/platform-live-role-catalog-20261111.json`. Use `node infrastructure/scripts/platform-role-lookup.mjs production table workflow_runs` for one entry.
- This alias exists only to avoid breaking old tool references; no separate startup, readback or test suite.
