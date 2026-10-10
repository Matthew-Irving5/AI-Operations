# ADR 0013: Run-targeted queue dispatch

- Status: Accepted
- Date: 2026-10-10
- Context: AI-15 staging acceptance launches runs through the AAL2-protected
  `workflow-launch` endpoint. The endpoint durably queues a run, but no caller
  invokes `job-worker`. A generic worker claim could consume a different older
  queued run before the candidate under test.

## Decision

After the authenticated launch RPC creates or resolves its idempotent run,
`workflow-launch` invokes the existing secret-authenticated `job-worker`
endpoint with only that `runId`. The worker uses a service-role-only
`claim_job_queue_for_run` RPC. That RPC delegates to the same lease, retry,
expiry, run-start and trace implementation as generic claims, constrained to
the requested `workflow_execute` row. A live lease cannot be claimed twice.
Generic `claim_job_queue` retains its existing priority and ordering behavior.

The caller's AAL2 check remains the user authorization boundary. The internal
worker request uses the configured `WORKER_SECRET` only in a server-side header;
it does not forward a user token or expose the secret in the request body or
response. Missing worker configuration fails closed and reports the already
queued `runId` so the same idempotent request can be retried.

## Consequences

- An on-demand launch can process its own queue row without leasing unrelated
  work first.
- Generic workers and queue retry semantics remain unchanged.
- This is an on-demand dispatch path. A recurring production caller for
  scheduled work remains a separate infrastructure requirement; this decision
  does not add a scheduler or change schedule dispatch.
- The worker RPC's service-role-only access and targeted lease behavior are
  covered by the RPC matrix and pgTAP regression.
