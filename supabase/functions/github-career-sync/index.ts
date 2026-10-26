import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { consumeRateLimit } from "../_shared/rate-limit.ts";
import {
  fetchGithubPullRequestFilesEvidence,
  githubAllowedOwner,
  type GithubEvidenceRecord,
  githubOwnerDenialAuditEvent,
  type GithubRepository,
  isGithubRequestId,
  parseGithubCommitEvidence,
  parseGithubDocumentationEvidence,
  parseGithubPullRequestEvidence,
  parseGithubReadme,
  parseGithubReleaseEvidence,
  parseGithubRepositories,
  parseGithubSyncRequest,
  requestGithubRepositoriesForAuthenticatedUser,
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

type CareerGithubRow = {
  user_id: string;
  repository_external_id: number;
  repository_name: string;
  owner_login: string;
  evidence_kind: string;
  source_url: string;
  source_date: string | null;
  retrieved_at: string;
  payload: Record<string, unknown>;
};

function sourceRows(
  userId: string,
  repository: GithubRepository,
  evidence: GithubEvidenceRecord[],
  retrievedAt: string,
): CareerGithubRow[] {
  return evidence.map((record) => ({
    user_id: userId,
    repository_external_id: repository.id,
    repository_name: repository.name,
    owner_login: githubAllowedOwner,
    evidence_kind: record.evidenceKind,
    source_url: record.sourceUrl,
    source_date: record.sourceDate,
    retrieved_at: retrievedAt,
    payload: { ...record.payload },
  }));
}

async function githubJson(
  targetUrl: string,
  token: string,
): Promise<{ response: Response; payload: unknown }> {
  const response = await fetch(targetUrl, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "AI-Operations-career-sync",
    },
  });
  return { response, payload: await response.json().catch(() => null) };
}

function repositoryEndpoint(
  repository: GithubRepository,
  resource: string,
): URL {
  return new URL(
    `/repos/${githubAllowedOwner}/${
      encodeURIComponent(repository.name)
    }/${resource}`,
    "https://api.github.com",
  );
}

function githubHeaders(token: string): HeadersInit {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "AI-Operations-career-sync",
  };
}

Deno.serve(async (request) => {
  const suppliedRequestId = request.headers.get("x-request-id");
  const requestId = isGithubRequestId(suppliedRequestId)
    ? suppliedRequestId
    : crypto.randomUUID();
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
  const parsedRequest = parseGithubSyncRequest(
    await request.json().catch(() => null),
  );
  if ("error" in parsedRequest) {
    if (parsedRequest.error !== "invalid_request") {
      const deniedOwner = parsedRequest.error === "owner_hard_denied";
      const audit = await service.from("audit_events").insert(
        githubOwnerDenialAuditEvent({
          userId: identity.user.id,
          requestId,
          reason: parsedRequest.error,
        }),
      );
      if (audit.error) {
        return failure(
          requestId,
          "github_owner_denial_audit_failed",
          500,
          "persistence.owner_denial_audit",
          `The owner policy denied the GitHub sync, but its security event could not be recorded (${
            audit.error.code ?? "database_error"
          }). No provider request was made.`,
          "Do not retry with another owner. Provide the request ID so the security audit boundary can be repaired.",
        );
      }
      return failure(
        requestId,
        deniedOwner
          ? "github_owner_hard_denied"
          : "github_owner_not_allowlisted",
        403,
        "authorization.owner_allowlist",
        deniedOwner
          ? "The requested GitHub owner is explicitly blocked; no provider request was made."
          : "The requested GitHub owner is not allowlisted; no provider request was made.",
        "Use the configured personal GitHub owner. The denied target was not fetched or retained.",
      );
    }
    return failure(
      requestId,
      "invalid_request",
      400,
      "request.validation",
      "The GitHub sync request must contain only the UUID of its one-time fresh-MFA gate.",
      "Start the sync again from Career and complete the in-page Microsoft Authenticator challenge.",
    );
  }
  if (!(await consumeRateLimit(identity.user.id, "github_career_sync", 3))) {
    return failure(
      requestId,
      "rate_limited",
      429,
      "control_plane.rate_limit",
      "The GitHub sync limit was reached for this account.",
      "Wait before starting another sync; the previous evidence remains unchanged.",
    );
  }
  const { mfaGateId } = parsedRequest.request;
  const { data: gateConsumed, error: gateError } = await caller.rpc(
    "consume_mfa_action_gate",
    {
      p_gate_id: mfaGateId,
      p_action_key: "github_sync",
    },
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
  let authenticatedUserResponse: Response;
  let authenticatedUserPayload: unknown;
  try {
    const authenticatedUser = await githubJson(
      "https://api.github.com/user",
      token,
    );
    authenticatedUserResponse = authenticatedUser.response;
    authenticatedUserPayload = authenticatedUser.payload;
  } catch {
    return failure(
      requestId,
      "github_provider_unreachable",
      502,
      "provider.github.identity",
      "The Edge Function could not verify the configured GitHub token owner; no repository request was made.",
      "Retry once after checking provider availability. If it repeats, provide the request ID.",
    );
  }
  if (!authenticatedUserResponse.ok) {
    return failure(
      requestId,
      "github_provider_identity_failed",
      502,
      "provider.github.identity",
      `GitHub rejected the token identity request with HTTP ${authenticatedUserResponse.status}; no repository request was made.`,
      "Verify the read-only token is valid for the configured personal GitHub account.",
      { providerStatus: authenticatedUserResponse.status },
    );
  }
  let repositoryRequest: Awaited<
    ReturnType<typeof requestGithubRepositoriesForAuthenticatedUser>
  >;
  try {
    repositoryRequest = await requestGithubRepositoriesForAuthenticatedUser(
      authenticatedUserPayload,
      (targetUrl) => fetch(targetUrl, { headers: githubHeaders(token) }),
    );
  } catch {
    return failure(
      requestId,
      "github_provider_unreachable",
      502,
      "provider.github.request",
      "The Edge Function could not reach the allowlisted GitHub repository endpoint; no repository evidence was changed.",
      "Retry once after checking provider availability. If it repeats, provide the request ID.",
    );
  }
  if ("error" in repositoryRequest) {
    if (repositoryRequest.error === "invalid_response") {
      return failure(
        requestId,
        "github_sync_invalid_identity",
        502,
        "provider.github.identity_validation",
        "GitHub returned an identity response that did not match the configured account contract; no repository request was made.",
        "Verify the read-only token identity response and retry after correcting the provider configuration.",
      );
    }
    const deniedOwner = repositoryRequest.error === "owner_hard_denied";
    const audit = await service.from("audit_events").insert(
      githubOwnerDenialAuditEvent({
        userId: identity.user.id,
        requestId,
        reason: repositoryRequest.error,
      }),
    );
    if (audit.error) {
      return failure(
        requestId,
        "github_owner_denial_audit_failed",
        500,
        "persistence.owner_denial_audit",
        `The owner policy denied the GitHub sync, but its security event could not be recorded (${
          audit.error.code ?? "database_error"
        }). No repository request was made.`,
        "Do not retry with another owner. Provide the request ID so the security audit boundary can be repaired.",
      );
    }
    return failure(
      requestId,
      deniedOwner ? "github_owner_hard_denied" : "github_owner_not_allowlisted",
      403,
      "authorization.owner_allowlist",
      "The configured GitHub token identity is not the allowlisted personal account; no repository request was made.",
      "Configure a read-only token for the approved personal GitHub account.",
    );
  }
  const response = repositoryRequest.response;
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
  const rows: CareerGithubRow[] = parsed.repositories.map((repository) => ({
    user_id: identity.user.id,
    repository_external_id: repository.id,
    repository_name: repository.name,
    owner_login: repository.ownerLogin,
    evidence_kind: "repository",
    source_url: repository.htmlUrl,
    source_date: repository.updatedAt,
    retrieved_at: retrievedAt,
    payload: {
      id: repository.id,
      name: repository.name,
      language: repository.language,
    },
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
  let detailCount = 0;
  for (const repository of parsed.repositories.slice(0, 5)) {
    const commitsUrl = repositoryEndpoint(repository, "commits");
    commitsUrl.searchParams.set("per_page", "20");
    const pullsUrl = repositoryEndpoint(repository, "pulls");
    pullsUrl.searchParams.set("state", "closed");
    pullsUrl.searchParams.set("sort", "updated");
    pullsUrl.searchParams.set("direction", "desc");
    pullsUrl.searchParams.set("per_page", "20");
    const releasesUrl = repositoryEndpoint(repository, "releases");
    releasesUrl.searchParams.set("per_page", "20");
    const readmeUrl = repositoryEndpoint(repository, "readme");
    let details: Awaited<ReturnType<typeof githubJson>>[];
    try {
      details = await Promise.all([
        githubJson(commitsUrl.toString(), token),
        githubJson(pullsUrl.toString(), token),
        githubJson(releasesUrl.toString(), token),
        githubJson(readmeUrl.toString(), token),
      ]);
    } catch {
      return failure(
        requestId,
        "github_provider_unreachable",
        502,
        "provider.github.evidence",
        "GitHub evidence retrieval failed before any Career evidence was changed.",
        "Retry once after checking provider availability. If it repeats, provide the request ID.",
      );
    }
    const [commits, pulls, releases, readme] = details;
    const requiredResponses = [commits, pulls, releases];
    const failedResponse = requiredResponses.find((result) =>
      !result.response.ok
    );
    if (failedResponse) {
      return failure(
        requestId,
        "github_provider_evidence_failed",
        failedResponse.response.status === 429 ? 429 : 502,
        "provider.github.evidence",
        `GitHub rejected bounded evidence retrieval with HTTP ${failedResponse.response.status}; no Career evidence was changed.`,
        failedResponse.response.status === 429
          ? "Wait for the GitHub rate limit to reset before retrying."
          : "Verify read-only repository metadata access and retry once.",
        { providerStatus: failedResponse.response.status },
      );
    }
    const commitEvidence = parseGithubCommitEvidence(
      commits.payload,
      repository.name,
    );
    const pullEvidence = parseGithubPullRequestEvidence(
      pulls.payload,
      repository.name,
    );
    const releaseEvidence = parseGithubReleaseEvidence(
      releases.payload,
      repository.name,
    );
    if (!commitEvidence || !pullEvidence || !releaseEvidence) {
      return failure(
        requestId,
        "github_sync_invalid_evidence",
        502,
        "provider.github.evidence_validation",
        "GitHub returned evidence that did not match the normalized provenance contract; no Career evidence was changed.",
        "Retry after verifying the provider response contract; no raw provider content was retained.",
      );
    }
    let normalizedPullEvidence = pullEvidence;
    const latestAuthoredPullRequest = pullEvidence[0];
    if (latestAuthoredPullRequest) {
      const fileEvidence = await fetchGithubPullRequestFilesEvidence(
        repository,
        latestAuthoredPullRequest,
        (targetUrl) => githubJson(targetUrl, token),
      );
      if ("error" in fileEvidence) {
        const isProviderFailure = fileEvidence.error === "provider_failed";
        const rateLimited = fileEvidence.status === 429;
        return failure(
          requestId,
          fileEvidence.error === "provider_unreachable"
            ? "github_provider_unreachable"
            : isProviderFailure
            ? "github_provider_pull_request_files_failed"
            : "github_sync_invalid_pull_request_files",
          rateLimited ? 429 : 502,
          fileEvidence.error === "invalid_response" ||
            fileEvidence.error === "owner_not_allowlisted"
            ? "provider.github.pull_request_files_validation"
            : "provider.github.pull_request_files",
          fileEvidence.error === "provider_unreachable"
            ? "Authored pull request file evidence could not be retrieved; no Career evidence was changed."
            : isProviderFailure
            ? `GitHub rejected bounded authored pull request file retrieval with HTTP ${fileEvidence.status}; no Career evidence was changed.`
            : "GitHub returned pull request file evidence outside the normalized provenance contract; no Career evidence was changed.",
          rateLimited
            ? "Wait for the GitHub rate limit to reset before retrying."
            : fileEvidence.error === "owner_not_allowlisted"
            ? "Confirm the configured token targets only Matthew-Irving5; no repository request was made."
            : "Verify read-only pull request metadata access and retry once.",
          fileEvidence.status === undefined
            ? {}
            : { providerStatus: fileEvidence.status },
        );
      }
      normalizedPullEvidence = pullEvidence.map((record) =>
        record === latestAuthoredPullRequest ? fileEvidence.evidence : record
      );
    }
    const repositoryEvidence = [
      ...commitEvidence,
      ...normalizedPullEvidence,
      ...releaseEvidence,
    ];
    if (readme.response.ok) {
      const parsedReadme = parseGithubReadme(readme.payload, repository.name);
      if (!parsedReadme) {
        return failure(
          requestId,
          "github_sync_invalid_documentation",
          502,
          "provider.github.documentation_validation",
          "GitHub returned a documentation reference outside the normalized repository contract; no Career evidence was changed.",
          "Retry after verifying the provider response contract; no raw provider content was retained.",
        );
      }
      const documentationCommitsUrl = repositoryEndpoint(repository, "commits");
      documentationCommitsUrl.searchParams.set("path", parsedReadme.path);
      documentationCommitsUrl.searchParams.set("per_page", "1");
      let documentationCommits: Awaited<ReturnType<typeof githubJson>>;
      try {
        documentationCommits = await githubJson(
          documentationCommitsUrl.toString(),
          token,
        );
      } catch {
        return failure(
          requestId,
          "github_provider_unreachable",
          502,
          "provider.github.documentation",
          "GitHub documentation provenance could not be retrieved; no Career evidence was changed.",
          "Retry once after checking provider availability. If it repeats, provide the request ID.",
        );
      }
      if (!documentationCommits.response.ok) {
        return failure(
          requestId,
          "github_provider_documentation_failed",
          documentationCommits.response.status === 429 ? 429 : 502,
          "provider.github.documentation",
          `GitHub rejected documentation provenance retrieval with HTTP ${documentationCommits.response.status}; no Career evidence was changed.`,
          "Verify read-only repository metadata access and retry once.",
          { providerStatus: documentationCommits.response.status },
        );
      }
      const documentation = parseGithubDocumentationEvidence(
        readme.payload,
        documentationCommits.payload,
        repository.name,
      );
      if (!documentation) {
        return failure(
          requestId,
          "github_sync_invalid_documentation",
          502,
          "provider.github.documentation_validation",
          "GitHub documentation provenance did not match the normalized contract; no Career evidence was changed.",
          "Retry after verifying the provider response contract; no raw provider content was retained.",
        );
      }
      repositoryEvidence.push(...documentation);
    } else if (readme.response.status !== 404) {
      return failure(
        requestId,
        "github_provider_documentation_failed",
        readme.response.status === 429 ? 429 : 502,
        "provider.github.documentation",
        `GitHub rejected documentation reference retrieval with HTTP ${readme.response.status}; no Career evidence was changed.`,
        "Verify read-only repository metadata access and retry once.",
        { providerStatus: readme.response.status },
      );
    }
    const normalizedRows = sourceRows(
      identity.user.id,
      repository,
      repositoryEvidence,
      retrievedAt,
    );
    rows.push(...normalizedRows);
    detailCount += normalizedRows.length;
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
      repository_count: parsed.repositories.length,
      evidence_count: rows.length,
      detail_evidence_count: detailCount,
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
      repositories: parsed.repositories.length,
      evidenceRecords: rows.length,
      detailedEvidenceRecords: detailCount,
      retrievedAt,
    },
    200,
    requestId,
  );
});
