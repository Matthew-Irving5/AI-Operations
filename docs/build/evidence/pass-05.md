# Pass 05 evidence

Status: READY_FOR_REVIEW

Scope: Career Operations, Travel Planning, and Consumer & Procurement Operations.

## Safety and contracts

- The GitHub connector constructs requests only for `Matthew-Irving5`, revalidates every returned owner, and rejects `BrightSG` before evidence storage.
- Career repository/activity evidence, skills evidence, goals, opportunities, and cited current research retain user ownership and timestamps.
- Travel and procurement runs carry an individual hard cap, bounded search count, and Terra-or-Luna model ceiling. On-demand spend remains a run-level policy, not a recurring-cap mutation.
- Travel watches expire and retain a trigger fingerprint so unchanged conditions do not email again.
- Procurement records recommendations, exclusions, citations, total cost, receipt provenance, return deadlines, and warranty dates.

## Validation record

- Targeted manager-core tests: PASS.
- Targeted integration tests including allowlisted/denied GitHub fixtures: PASS.
- Workspace typecheck: PASS.
- Database reset and pgTAP RLS/contracts: PASS.
- Full CI-equivalent validation: PASS (`corepack pnpm verify:ci`). This includes Prettier, lint, strict typecheck, workspace unit tests, production build, empty-database migration reset, 38 pgTAP RLS/contracts tests, Deno format/lint, Python checks, security scan, and Playwright Chromium/WebKit.
