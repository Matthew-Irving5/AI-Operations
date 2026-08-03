export const ALLOWED_GITHUB_OWNER = 'Matthew-Irving5';
const DENIED_GITHUB_OWNER = 'BrightSG';

export type GithubRepository = Readonly<{
  id: number;
  name: string;
  owner: Readonly<{ login: string }>;
  html_url: string;
  updated_at: string;
}>;

/** Validates the returned owner before repository content is used or retained. */
export function requirePersonalGithubOwner(owner: string): typeof ALLOWED_GITHUB_OWNER {
  if (owner === DENIED_GITHUB_OWNER) throw new Error('github_owner_hard_denied');
  if (owner !== ALLOWED_GITHUB_OWNER) throw new Error('github_owner_not_allowlisted');
  return ALLOWED_GITHUB_OWNER;
}

export function validateGithubRepository(repository: GithubRepository): GithubRepository {
  requirePersonalGithubOwner(repository.owner.login);
  if (!Number.isSafeInteger(repository.id) || repository.id <= 0 || !repository.name) {
    throw new Error('github_repository_invalid');
  }
  return repository;
}

export async function listPersonalGithubRepositories(
  request: (url: string) => Promise<Readonly<{ ok: boolean; json(): Promise<unknown> }>>,
): Promise<readonly GithubRepository[]> {
  const response = await request(
    `https://api.github.com/users/${ALLOWED_GITHUB_OWNER}/repos?per_page=100`,
  );
  if (!response.ok) throw new Error('github_sync_unavailable');
  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error('github_sync_invalid_response');
  return payload.map((item) => validateGithubRepository(item as GithubRepository));
}
