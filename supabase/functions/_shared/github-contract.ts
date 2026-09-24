export const githubAllowedOwner = "Matthew-Irving5";
export const githubDeniedOwner = "BrightSG";

export type GithubRepository = {
  id: number;
  name: string;
  ownerLogin: string;
  htmlUrl: string;
};

type GithubRepositoryResponse = {
  id?: unknown;
  name?: unknown;
  owner?: { login?: unknown };
  html_url?: unknown;
};

export function parseGithubRepositories(
  payload: unknown,
): { repositories: GithubRepository[] } | {
  error: "invalid_response" | "owner_denied";
} {
  if (!Array.isArray(payload)) return { error: "invalid_response" };
  const repositories: GithubRepository[] = [];
  for (const value of payload as GithubRepositoryResponse[]) {
    const id = value?.id;
    const name = value?.name;
    const ownerLogin = value?.owner?.login;
    const htmlUrl = value?.html_url;
    if (
      typeof id !== "number" || !Number.isSafeInteger(id) ||
      typeof name !== "string" || name.length === 0 || name.length > 200 ||
      typeof ownerLogin !== "string" || ownerLogin === githubDeniedOwner ||
      ownerLogin !== githubAllowedOwner ||
      typeof htmlUrl !== "string" ||
      !htmlUrl.startsWith(`https://github.com/${githubAllowedOwner}/`)
    ) return { error: "owner_denied" };
    repositories.push({ id, name, ownerLogin, htmlUrl });
  }
  return { repositories };
}
