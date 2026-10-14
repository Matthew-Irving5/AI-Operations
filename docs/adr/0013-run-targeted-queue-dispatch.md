# ADR 0013: Run-targeted queue dispatch

- Status: Accepted
- Date: 2026-10-10
- Context: AI-15 staging acceptance launches runs through the AAL2-protected
  `workflow-launch` endpoint. The endpoint durably queues a run and invokes
  `job-worker`, but waiting for the worker's nested execution can exceed the
  launch request window. A generic worker claim could consume a different
  older queued run before the candidate under test.

## Decision

After the authenticated launch RPC creates or resolves its idempotent run and
the launch audit is recorded, `workflow-launch` returns its existing `201`
response containing only `runId`; it registers the existing
secret-authenticated `job-worker` invocation with `EdgeRuntime.waitUntil` so
the request does not await execution. The worker receives only that `runId`
and uses a service-role-only
`claim_job_queue_for_run` RPC. That RPC delegates to the same lease, retry,
expiry, run-start and trace implementation as generic claims, constrained to
the requested `workflow_execute` row. A live lease cannot be claimed twice.
Generic `claim_job_queue` retains its existing priority and ordering behavior.

If `waitUntil` is unavailable or rejects registration, the worker is not
invoked and the durable queue row remains queued. If the registered invocation
fails, it logs only a safe event name, run ID and stage. The existing claim and
lease-expiry rules determine queue state, but an eligible row is reclaimed only
when a worker is invoked. The repository currently schedules
`dispatch_due_schedules()` but has no recurring generic queue-worker caller;
that separate infrastructure requirement is not introduced here. Launch
acceptance does not claim that execution has completed.

The caller's AAL2 check remains the user authorization boundary. The internal
worker request uses the configured `WORKER_SECRET` only in a server-side header;
it does not forward a user token or expose the secret in the request body or
response. Missing worker configuration fails closed and reports the already
queued `runId` so the same idempotent request can be retried.

## Consequences

- An on-demand launch can process its own queue row without leasing unrelated
  work first, and a slow worker no longer delays the accepted launch response.
- Generic workers and queue retry semantics remain unchanged.
- This is an on-demand dispatch path. A recurring production caller for
  scheduled work remains a separate infrastructure requirement; this decision
  does not add a scheduler or change schedule dispatch.
- The worker RPC's service-role-only access and targeted lease behavior are
  covered by the RPC matrix and pgTAP regression.
