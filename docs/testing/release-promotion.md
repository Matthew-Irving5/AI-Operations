# Staged release and production promotion

AI-8 stages an unmerged pull request head, proves it through the existing AI-7 hosted browser harness, and promotes only its verified squash merge. No staging or production workflow waits for MFA.

## Release identity

Staging acceptance records the exact PR head SHA, its Git tree SHA, PR number, and candidate deployment run. A later PR commit has no accepted status and must be staged and accepted again.

After squash merge, production verifies that the requested deployment SHA is the actual merge commit, exactly one associated merged PR is the accepted PR, that PR head equals the accepted candidate SHA, and the merge commit tree equals the accepted candidate tree. Tree equality alone does not establish provenance. All checks run before production mutations.

## Candidate staging

The `Staging candidate gate` selects the newest run for each required workflow on the exact PR SHA, ordering by workflow run number and then rerun attempt. It admits only a current, open, same-repository PR targeting `main` after all nine required workflows pass.

AI-8’s bootstrap path uses the existing `Deploy staging` workflow because new workflow files cannot trigger before they exist on the default branch. Manually dispatch it against the PR branch and exact head SHA:

```powershell
$branch = 'matthewirvingai/ai-8-upgrade-cicd-from-http-smoke-tests-to-capability-level'
$sha = '<current 40-character PR head SHA>'
gh workflow run deploy-staging.yml --ref $branch -f mode=candidate -f candidate_sha=$sha
```

This branch-ref workflow validates the current same-repository PR and all nine latest required checks for the exact SHA before it accesses the staging environment. Review the workflow diff before dispatch. Fork PRs are rejected. The staging environment currently has no required reviewers, so this review is an explicit operator checkpoint.

The candidate deploy uses the verified SHA as the Worker’s `RELEASE_SHA`, deploys the existing staging migrations and Edge Functions, checks drift and readiness, and emits a deployment artifact with the candidate SHA, tree SHA, PR number, and run identity.

## Hosted acceptance and shared staging lease

Run the existing headed hosted acceptance with the candidate SHA, tree SHA, PR number, and deployment run ID in its environment. Use the real staging password flow and complete MFA manually in the visible browser. The same browser session then runs the Chromium and WebKit capability journey, including an explicit `GET /api/release` assertion against the candidate SHA. The resulting JSON contains only redacted evidence and pass outcomes; it contains no password, token, cookie, MFA code, or observed release SHA.

After that run finishes, publish its JSON through `Deploy staging` in `acceptance` mode against the same PR branch. Supply the exact SHA, candidate deployment run ID, `accepted` outcome, and the JSON emitted by the headed runner. The workflow revalidates the current PR head/tree/number and deployment artifact/run before it uploads acceptance evidence and posts the required status:

```text
AI Operations / Staging capability acceptance
```

The status stays pending until valid hosted evidence is accepted. Missing, stale, malformed, or failed evidence produces failure. Strict current-head status rules prevent an older accepted SHA from authorizing a newer PR head.

Candidate deployments share the `staging-deployment` concurrency group. Before a candidate mutates staging, the workflow checks current open same-repository PR heads for a pending acceptance status whose description says staging is deployed and awaiting hosted acceptance. A competing candidate fails closed with `staging_slot_busy`. Closed PRs, advanced heads, and statuses already completed as success or failure release the lease. To retry after the owner completes acceptance, dispatch candidate mode again with the same exact branch and SHA; the dispatch rechecks all nine required workflows and the lease. The automatic gate also permits a retry when a required workflow completes again after the lease clears.

## Production promotion and smoke

After squash merge, the existing successful `Deploy staging` run on `main` triggers production promotion. Manual production dispatch uses the same provenance checks. The workflow resolves the accepted status’s run URL and artifact, validates the exact deployment attempt and merged PR/tree provenance, then proceeds with production environment, Worker, migration, Edge Function, and drift steps.

The Worker receives the verified merge SHA as `RELEASE_SHA`. After all production mutations and environment checks, bounded read-only smoke probes verify the live release SHA, login shell, expected anonymous authorization denial, and sign-in redirect behavior. Failed probes make the run fail and write redacted evidence for upload; they cannot produce production acceptance.

Production evidence and status are not a substitute for the required live E2E sign-off. Keep AI-8 In Progress until the deliberate staging failure/recovery, accepted squash merge, production smoke, and truthful Linear evidence are complete.
