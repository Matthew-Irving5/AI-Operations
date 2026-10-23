export const githubAllowedOwner = "Matthew-Irving5";
export const githubDeniedOwner = "BrightSG";

export type GithubSyncRequest = Readonly<{ mfaGateId: string }>;
export type GithubSyncRequestError =
  | "owner_hard_denied"
  | "owner_not_allowlisted"
  | "invalid_request";

export function isGithubRequestId(value: string | null): value is string {
  return (
    value !== null &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value)
  );
}

export function githubOwnerDenialAuditEvent(input: {
  userId: string;
  requestId: string;
  reason: Exclude<GithubSyncRequestError, "invalid_request">;
}) {
  const hardDenied = input.reason === "owner_hard_denied";
  return {
    user_id: input.userId,
    actor_type: "user" as const,
    action_type: "github_career_sync_owner_denied" as const,
    target_type: "github_owner" as const,
    target_id: hardDenied
      ? ("hard_denied" as const)
      : ("not_allowlisted" as const),
    correlation_id: input.requestId,
    result: "denied" as const,
    redacted_after: {
      reason: input.reason,
      provider_request_made: false as const,
    },
  };
}

export type GithubRepository = Readonly<{
  id: number;
  name: string;
  ownerLogin: string;
  htmlUrl: string;
  updatedAt: string | null;
  language: string | null;
}>;

export type GithubEvidenceKind =
  | "activity"
  | "pull_request"
  | "release"
  | "documentation";
export type GithubEvidenceRecord = Readonly<{
  evidenceKind: GithubEvidenceKind;
  sourceUrl: string;
  sourceDate: string;
  payload: Readonly<Record<string, unknown>>;
}>;
export type GithubPullRequestFile = Readonly<{
  path: string;
  blobUrl: string;
  additions: number;
}>;

export type GithubAuthenticatedUser = Readonly<
  { login: typeof githubAllowedOwner }
>;

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}

function personalGithubUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      url.pathname.startsWith(`/${githubAllowedOwner}/`) &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function personalRepositoryUrl(
  value: unknown,
  repositoryName: string,
): value is string {
  if (!personalGithubUrl(value)) return false;
  const url = new URL(value);
  return url.pathname.replace(/\/$/, "") ===
    `/${githubAllowedOwner}/${repositoryName}`;
}

function sourceDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function providerRecords(payload: unknown): RecordValue[] | null {
  if (!Array.isArray(payload)) return null;
  const records = payload.map(asRecord);
  return records.every((value): value is RecordValue => value !== null)
    ? records
    : null;
}

function evidenceRecord(
  evidenceKind: GithubEvidenceKind,
  sourceUrl: unknown,
  date: unknown,
  payload: Record<string, string | number | null>,
): GithubEvidenceRecord | null {
  const normalizedDate = sourceDate(date);
  if (!personalGithubUrl(sourceUrl) || !normalizedDate) return null;
  return { evidenceKind, sourceUrl, sourceDate: normalizedDate, payload };
}

export function requireGithubOwner(owner: unknown): typeof githubAllowedOwner {
  if (typeof owner !== "string") {
    throw new Error("github_owner_not_allowlisted");
  }
  if (owner.toLowerCase() === githubDeniedOwner.toLowerCase()) {
    throw new Error("github_owner_hard_denied");
  }
  if (owner !== githubAllowedOwner) {
    throw new Error("github_owner_not_allowlisted");
  }
  return githubAllowedOwner;
}

export function parseGithubAuthenticatedUser(
  payload: unknown,
):
  | { user: GithubAuthenticatedUser }
  | {
    error: "owner_hard_denied" | "owner_not_allowlisted" | "invalid_response";
  } {
  const user = asRecord(payload);
  const owner = user?.login;
  if (typeof owner !== "string") return { error: "invalid_response" };
  if (owner.toLowerCase() === githubDeniedOwner.toLowerCase()) {
    return { error: "owner_hard_denied" };
  }
  if (owner !== githubAllowedOwner) return { error: "owner_not_allowlisted" };
  return { user: { login: githubAllowedOwner } };
}

export async function requestGithubRepositories(
  owner: unknown,
  request: (url: string) => Response | Promise<Response>,
): Promise<Response> {
  const allowedOwner = requireGithubOwner(owner);
  const url = new URL(
    `/users/${allowedOwner}/repos?per_page=100&sort=updated&affiliation=owner`,
    "https://api.github.com",
  );
  return await request(url.toString());
}

export async function requestGithubRepositoriesForAuthenticatedUser(
  payload: unknown,
  request: (url: string) => Response | Promise<Response>,
): Promise<
  | { response: Response }
  | {
    error: "owner_hard_denied" | "owner_not_allowlisted" | "invalid_response";
  }
> {
  const authenticatedUser = parseGithubAuthenticatedUser(payload);
  if ("error" in authenticatedUser) return authenticatedUser;
  return {
    response: await requestGithubRepositories(
      authenticatedUser.user.login,
      request,
    ),
  };
}

function requestedOwnerError(owner: unknown): GithubSyncRequestError | null {
  if (typeof owner !== "string") return "invalid_request";
  if (owner.toLowerCase() === githubDeniedOwner.toLowerCase()) {
    return "owner_hard_denied";
  }
  return owner === githubAllowedOwner ? null : "owner_not_allowlisted";
}

export function parseGithubSyncRequest(
  payload: unknown,
): { request: GithubSyncRequest } | { error: GithubSyncRequestError } {
  const body = asRecord(payload);
  if (!body) return { error: "invalid_request" };

  const repository = body.repository;
  const repositoryRecord = asRecord(repository);
  const repositoryOwner = typeof repository === "string"
    ? repository.split("/", 1)[0]
    : (asRecord(repositoryRecord?.owner)?.login ?? repositoryRecord?.owner);
  const owners = [
    body.owner,
    body.repositoryOwner,
    body.repository_owner,
    repositoryOwner,
  ].filter(
    (owner) => owner !== undefined && owner !== null,
  );
  const ownerErrors = owners.map(requestedOwnerError);
  if (ownerErrors.includes("owner_hard_denied")) {
    return { error: "owner_hard_denied" };
  }
  const ownerError = ownerErrors.find((error) => error !== null);
  if (ownerError) return { error: ownerError };

  const keys = Object.keys(body);
  const mfaGateId = body.mfaGateId;
  if (
    keys.length !== 1 ||
    keys[0] !== "mfaGateId" ||
    typeof mfaGateId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(mfaGateId)
  ) {
    return { error: "invalid_request" };
  }
  return { request: { mfaGateId } };
}

export function parseGithubRepositories(
  payload: unknown,
): { repositories: GithubRepository[] } | {
  error: "invalid_response" | "owner_denied";
} {
  if (!Array.isArray(payload)) return { error: "invalid_response" };
  const repositories: GithubRepository[] = [];
  for (const value of payload) {
    const record = asRecord(value);
    const ownerLogin = asRecord(record?.owner)?.login;
    const updatedAt = sourceDate(record?.updated_at);
    if (
      !record ||
      typeof record.id !== "number" ||
      !Number.isSafeInteger(record.id) ||
      record.id <= 0 ||
      typeof record.name !== "string" ||
      !/^[A-Za-z0-9_.-]{1,100}$/.test(record.name) ||
      record.name === "." ||
      record.name === ".." ||
      typeof ownerLogin !== "string" ||
      ownerLogin.toLowerCase() === githubDeniedOwner.toLowerCase() ||
      ownerLogin !== githubAllowedOwner ||
      !personalRepositoryUrl(record.html_url, record.name) ||
      (record.language !== undefined &&
        record.language !== null &&
        (typeof record.language !== "string" ||
          record.language.length > 100)) ||
      (record.updated_at !== undefined && record.updated_at !== null &&
        updatedAt === null)
    ) {
      return { error: "owner_denied" };
    }
    repositories.push({
      id: record.id,
      name: record.name,
      ownerLogin,
      htmlUrl: record.html_url,
      updatedAt,
      language: typeof record.language === "string" ? record.language : null,
    });
  }
  return { repositories };
}

export function parseGithubCommitEvidence(
  payload: unknown,
  repositoryName: string,
): GithubEvidenceRecord[] | null {
  const records = providerRecords(payload);
  if (!records) return null;
  const evidence: GithubEvidenceRecord[] = [];
  for (const record of records) {
    if (asRecord(record.author)?.login !== githubAllowedOwner) continue;
    const commit = asRecord(record.commit);
    const author = asRecord(commit?.author);
    if (typeof record.sha !== "string" || !/^[a-f0-9]{40}$/i.test(record.sha)) {
      return null;
    }
    const parsed = evidenceRecord("activity", record.html_url, author?.date, {
      kind: "commit",
      sha: record.sha,
      author: githubAllowedOwner,
    });
    if (
      !parsed ||
      !new URL(parsed.sourceUrl).pathname.startsWith(
        `/${githubAllowedOwner}/${repositoryName}/`,
      )
    ) {
      return null;
    }
    evidence.push(parsed);
  }
  return evidence;
}

export function parseGithubPullRequestEvidence(
  payload: unknown,
  repositoryName: string,
): GithubEvidenceRecord[] | null {
  const records = providerRecords(payload);
  if (!records) return null;
  const evidence: GithubEvidenceRecord[] = [];
  for (const record of records) {
    if (
      asRecord(record.user)?.login !== githubAllowedOwner || !record.merged_at
    ) continue;
    if (
      typeof record.number !== "number" || !Number.isSafeInteger(record.number)
    ) return null;
    const parsed = evidenceRecord(
      "pull_request",
      record.html_url,
      record.merged_at,
      {
        kind: "pull_request",
        number: record.number,
        author: githubAllowedOwner,
      },
    );
    if (
      !parsed ||
      !new URL(parsed.sourceUrl).pathname.startsWith(
        `/${githubAllowedOwner}/${repositoryName}/`,
      )
    ) {
      return null;
    }
    evidence.push(parsed);
  }
  return evidence;
}

function isPullRequestBlobUrl(
  value: unknown,
  repositoryName: string,
  path: string,
): value is string {
  if (!personalGithubUrl(value)) return false;
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    if (
      segments.length < 5 ||
      segments[0] !== githubAllowedOwner ||
      segments[1] !== repositoryName ||
      segments[2] !== "blob" ||
      !/^[a-f0-9]{40}$/i.test(segments[3])
    ) return false;
    return decodeURIComponent(segments.slice(4).join("/")) === path;
  } catch {
    return false;
  }
}

export function githubPullRequestFilesEndpoint(
  repository: GithubRepository,
  pullNumber: number,
): URL {
  if (
    repository.ownerLogin !== githubAllowedOwner ||
    !/^[A-Za-z0-9_.-]{1,100}$/.test(repository.name) ||
    repository.name === "." ||
    repository.name === ".." ||
    !personalRepositoryUrl(repository.htmlUrl, repository.name) ||
    !Number.isSafeInteger(pullNumber) ||
    pullNumber <= 0
  ) {
    throw new Error("github_pull_request_not_allowlisted");
  }
  const url = new URL(
    `/repos/${githubAllowedOwner}/${
      encodeURIComponent(repository.name)
    }/pulls/${pullNumber}/files`,
    "https://api.github.com",
  );
  url.searchParams.set("per_page", "30");
  return url;
}

export function parseGithubPullRequestFilesEvidence(
  payload: unknown,
  repository: GithubRepository,
  evidence: GithubEvidenceRecord,
): GithubEvidenceRecord | null {
  const number = evidence.payload.number;
  if (
    repository.ownerLogin !== githubAllowedOwner ||
    evidence.evidenceKind !== "pull_request" ||
    evidence.payload.kind !== "pull_request" ||
    evidence.payload.author !== githubAllowedOwner ||
    typeof number !== "number" ||
    !Number.isSafeInteger(number) ||
    number <= 0 ||
    evidence.sourceUrl !==
      `https://github.com/${githubAllowedOwner}/${repository.name}/pull/${number}` ||
    !sourceDate(evidence.sourceDate)
  ) return null;

  const records = providerRecords(payload);
  if (!records || records.length > 30) return null;
  const changedFiles: GithubPullRequestFile[] = [];
  for (const record of records) {
    const path = record.filename;
    const additions = record.additions;
    if (
      typeof path !== "string" ||
      path.length === 0 ||
      path.length > 500 ||
      path.startsWith("/") ||
      path.includes("\\") ||
      containsControlCharacter(path) ||
      path.split("/").some((segment) => segment === "." || segment === "..") ||
      typeof additions !== "number" ||
      !Number.isSafeInteger(additions) ||
      additions < 0 ||
      !isPullRequestBlobUrl(record.blob_url, repository.name, path)
    ) return null;
    changedFiles.push({ path, blobUrl: record.blob_url, additions });
  }

  return {
    ...evidence,
    payload: { ...evidence.payload, changedFiles },
  };
}

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const characterCode = value.charCodeAt(index);
    if (characterCode < 0x20 || characterCode === 0x7f) return true;
  }
  return false;
}

export async function fetchGithubPullRequestFilesEvidence(
  repository: GithubRepository,
  evidence: GithubEvidenceRecord,
  request: (url: string) =>
    | { response: Response; payload: unknown }
    | Promise<{ response: Response; payload: unknown }>,
): Promise<
  | { evidence: GithubEvidenceRecord }
  | {
    error:
      | "owner_not_allowlisted"
      | "provider_unreachable"
      | "provider_failed"
      | "invalid_response";
    status?: number;
  }
> {
  const pullNumber = evidence.payload.number;
  if (
    evidence.evidenceKind !== "pull_request" ||
    evidence.payload.kind !== "pull_request" ||
    evidence.payload.author !== githubAllowedOwner ||
    typeof pullNumber !== "number" ||
    !Number.isSafeInteger(pullNumber) ||
    pullNumber <= 0 ||
    evidence.sourceUrl !==
      `https://github.com/${githubAllowedOwner}/${repository.name}/pull/${pullNumber}` ||
    !sourceDate(evidence.sourceDate)
  ) return { error: "invalid_response" };
  let target: URL;
  try {
    target = githubPullRequestFilesEndpoint(repository, pullNumber);
  } catch {
    return { error: "owner_not_allowlisted" };
  }

  let result: { response: Response; payload: unknown };
  try {
    result = await request(target.toString());
  } catch {
    return { error: "provider_unreachable" };
  }
  if (!result.response.ok) {
    return { error: "provider_failed", status: result.response.status };
  }
  const normalized = parseGithubPullRequestFilesEvidence(
    result.payload,
    repository,
    evidence,
  );
  return normalized ? { evidence: normalized } : { error: "invalid_response" };
}

export function parseGithubReleaseEvidence(
  payload: unknown,
  repositoryName: string,
): GithubEvidenceRecord[] | null {
  const records = providerRecords(payload);
  if (!records) return null;
  const evidence: GithubEvidenceRecord[] = [];
  for (const record of records) {
    if (
      asRecord(record.author)?.login !== githubAllowedOwner ||
      !record.published_at
    ) continue;
    if (typeof record.id !== "number" || !Number.isSafeInteger(record.id)) {
      return null;
    }
    const tag = typeof record.tag_name === "string"
      ? record.tag_name.slice(0, 100)
      : null;
    const parsed = evidenceRecord(
      "release",
      record.html_url,
      record.published_at,
      {
        kind: "release",
        releaseId: record.id,
        tag,
        author: githubAllowedOwner,
      },
    );
    if (
      !parsed ||
      !new URL(parsed.sourceUrl).pathname.startsWith(
        `/${githubAllowedOwner}/${repositoryName}/`,
      )
    ) {
      return null;
    }
    evidence.push(parsed);
  }
  return evidence;
}

export function parseGithubReadme(
  payload: unknown,
  repositoryName: string,
): { path: string; htmlUrl: string } | null {
  const record = asRecord(payload);
  if (
    !record ||
    typeof record.path !== "string" ||
    record.path.length === 0 ||
    record.path.length > 500 ||
    !personalGithubUrl(record.html_url) ||
    !new URL(record.html_url).pathname.startsWith(
      `/${githubAllowedOwner}/${repositoryName}/`,
    )
  ) {
    return null;
  }
  return { path: record.path, htmlUrl: record.html_url };
}

export function parseGithubDocumentationEvidence(
  readmePayload: unknown,
  commitPayload: unknown,
  repositoryName: string,
): GithubEvidenceRecord[] | null {
  const readme = parseGithubReadme(readmePayload, repositoryName);
  const commits = providerRecords(commitPayload);
  if (!commits) return null;
  if (!readme || commits.length === 0) return [];
  const latest = commits[0];
  if (asRecord(latest.author)?.login !== githubAllowedOwner) return [];
  const commit = asRecord(latest.commit);
  const author = asRecord(commit?.author);
  const sha = latest.sha;
  if (typeof sha !== "string" || !/^[a-f0-9]{40}$/i.test(sha)) return null;
  const evidence = evidenceRecord(
    "documentation",
    readme.htmlUrl,
    author?.date,
    {
      kind: "documentation",
      path: readme.path,
      sha,
      author: githubAllowedOwner,
    },
  );
  return evidence ? [evidence] : null;
}
