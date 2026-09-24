import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { consumeRateLimit } from "../_shared/rate-limit.ts";
import {
  githubAllowedOwner,
  parseGithubRepositories,
} from "../_shared/github-contract.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const service = createClient(
  url,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);
const json = (body: unknown, status = 200, requestId?: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...(requestId ? { "x-request-id": requestId } : {}),
    },
  });

function failure(
  requestId: string,
  code: string,
  status: number,
  stage: string,
  detail: string,
  remediation: string,
  extra: Record<string, unknown> = {},
) {
  return json(
    {
      code,
      requestId,
      diagnostic: {
        code,
        stage,
        httpStatus: status,
        requestId,
        detail,
        remediation,
        ...extra,
      },
    },
    status,
    requestId,
  );
}

Deno.serve(async (request) => {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  if (request.method !== "POST") {
    return failure(
      requestId,
      "method_not_allowed",
      405,
      "request.method",
      "The GitHub career sync accepts POST requests only.",
      "Start the sync from the Career page; do not call the Edge Function with a browser URL.",
    );
  }
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return failure(
      requestId,
      "unauthorised",
      401,
      "authentication.header",
      "No bearer session was supplied to the GitHub sync control plane.",
      "Sign in again and complete fresh MFA before starting the sync.",
    );
  }
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: identity, error: identityError } = await caller.auth.getUser();
  if (identityError || !identity.user) {
    return failure(
      requestId,
      "authenticated_session_required",
      401,
      "authentication.user_lookup",
      "Supabase could not validate the signed-in account for the GitHub sync.",
      "Sign in again, complete fresh MFA, and retry once.",
    );
  }
  if (identity.user.email?.toLowerCase() !== "matthewirving99@gmail.com") {
    return failure(
      requestId,
      "github_account_not_allowed",
      403,
      "authorization.allowlist",
      "The authenticated account is not the approved AI Operations operator.",
      "Use the allowlisted production account; no GitHub request was made.",
    );
  }
  if (!await consumeRateLimit(identity.user.id, "github_career_sync", 3)) {
    return failure(
      requestId,
      "rate_limited",
      429,
      "control_plane.rate_limit",
      "The GitHub sync limit was reached for this account.",
      "Wait before starting another sync; the previous evidence remains unchanged.",
    );
  }
  const body = await request.json().catch(() => null) as
    | { mfaGateId?: unknown }
    | null;
  const mfaGateId = body?.mfaGateId;
  if (
    typeof mfaGateId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(mfaGateId)
  ) {
    return failure(
      requestId,
      "mfa_handoff_missing",
      400,
      "mfa_gate.validation",
      "The GitHub sync request did not contain the UUID of its one-time fresh-MFA gate.",
      "Start the sync again from Career and complete the in-page Microsoft Authenticator challenge.",
    );
  }
  const { data: gateConsumed, error: gateError } = await caller.rpc(
    "consume_mfa_action_gate",
    { p_gate_id: mfaGateId, p_action_key: "github_sync" },
  );
  if (gateError || gateConsumed !== true) {
    return failure(
      requestId,
      "fresh_mfa_required",
      403,
      "mfa_gate.consume",
      gateError
        ? "The one-time GitHub sync MFA gate could not be validated by the database boundary."
        : "The one-time GitHub sync MFA gate was missing, expired, replayed, or bound to another user.",
      "Start the sync again and complete a fresh Microsoft Authenticator challenge.",
    );
  }
  const token = Deno.env.get("GITHUB_PERSONAL_READ_TOKEN");
  if (!token) {
    return failure(
      requestId,
      "github_connection_unavailable",
      503,
      "configuration.github_token",
      "The read-only GitHub token is not configured in the Edge Function environment; no provider request was made.",
      "Add the protected PERSONAL_READ_TOKEN secret to the matching GitHub Actions environment (staging or production), redeploy so it is copied to the runtime, then retry.",
    );
  }
  let response: Response;
  try {
    response = await fetch(
      `https://api.github.com/users/${githubAllowedOwner}/repos?per_page=100&sort=updated`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
          "user-agent": "AI-Operations-career-sync",
        },
      },
    );
  } catch {
    return failure(
      requestId,
      "github_provider_unreachable",
      502,
      "provider.github.request",
      "The Edge Function could not reach the GitHub API; no repository evidence was changed.",
      "Retry once after checking provider availability. If it repeats, provide the request ID.",
    );
  }
  if (!response.ok) {
    const providerStatus = response.status;
    const providerCode = providerStatus === 401 || providerStatus === 403
      ? "github_provider_unauthorised"
      : providerStatus === 429
      ? "github_provider_rate_limited"
      : "github_provider_request_failed";
    return failure(
      requestId,
      providerCode,
      providerStatus === 429 ? 429 : 502,
      "provider.github.response",
      `GitHub rejected the read-only repository request with HTTP ${providerStatus}; no repository evidence was changed.`,
      providerStatus === 401 || providerStatus === 403
        ? "Verify the token is valid, scoped to Matthew-Irving5, and has repository metadata read access; do not add write permissions."
        : providerStatus === 429
        ? "Wait for the GitHub rate limit to reset before retrying."
        : "Retry once; if it repeats, provide the request ID and provider status.",
      { providerStatus },
    );
  }
  const parsed = parseGithubRepositories(
    await response.json().catch(() => null),
  );
  if ("error" in parsed) {
    return failure(
      requestId,
      parsed.error === "owner_denied"
        ? "github_owner_hard_denied"
        : "github_sync_invalid_response",
      parsed.error === "owner_denied" ? 403 : 502,
      "provider.github.validation",
      parsed.error === "owner_denied"
        ? "GitHub returned a repository outside the hard allowlist; no repository evidence was persisted."
        : "GitHub returned a response that did not match the repository evidence contract; no repository evidence was persisted.",
      "Confirm the configured token targets only Matthew-Irving5 and retry after correcting the provider response.",
    );
  }
  const retrievedAt = new Date().toISOString();
  const rows = parsed.repositories.map((repository) => ({
    user_id: identity.user.id,
    repository_external_id: repository.id,
    repository_name: repository.name,
    owner_login: repository.ownerLogin,
    evidence_kind: "repository",
    source_url: repository.htmlUrl,
    retrieved_at: retrievedAt,
    payload: { id: repository.id, name: repository.name },
  }));
  if (rows.length === 0) {
    return failure(
      requestId,
      "github_no_repositories",
      422,
      "provider.github.validation",
      "GitHub returned no repositories for Matthew-Irving5, so no repository evidence can satisfy the Career checklist.",
      "Confirm the token targets the intended Matthew-Irving5 account and has repository metadata read access.",
    );
  }
  const { error: persistenceError } = await service.from(
    "career_github_evidence",
  ).upsert(rows, {
    onConflict: "user_id,repository_external_id,evidence_kind,source_url",
  });
  if (persistenceError) {
    const databaseCode = persistenceError.code ?? "database_error";
    const permissionDenied = databaseCode === "42501";
    return failure(
      requestId,
      "github_evidence_store_failed",
      500,
      "persistence.career_github_evidence",
      `The GitHub response was valid, but repository evidence could not be stored (${
        persistenceError.code ?? "database_error"
      }).`,
      permissionDenied
        ? "The service-role database grants for career_github_evidence are incomplete. Deploy the server-only SELECT/INSERT/UPDATE grant migration, then retry; do not grant write access to the browser role."
        : "Retry once; if it repeats, provide the request ID and database code. No partial evidence was accepted.",
      { databaseCode },
    );
  }
  const audit = await service.from("audit_events").insert({
    user_id: identity.user.id,
    actor_type: "user",
    action_type: "github_career_sync",
    target_type: "github_owner",
    target_id: githubAllowedOwner,
    aal: "aal2_fresh",
    result: "success",
    redacted_after: {
      owner: githubAllowedOwner,
      repository_count: rows.length,
      retrieved_at: retrievedAt,
    },
  });
  if (audit.error) {
    return failure(
      requestId,
      "github_sync_audit_failed",
      500,
      "persistence.audit_event",
      `Repository evidence was stored, but the required audit event could not be recorded (${
        audit.error.code ?? "database_error"
      }).`,
      "Do not repeat the sync blindly; provide the request ID so the audit boundary can be repaired.",
    );
  }
  return json(
    {
      code: "github_sync_complete",
      requestId,
      owner: githubAllowedOwner,
      repositories: rows.length,
      retrievedAt,
    },
    200,
    requestId,
  );
});
