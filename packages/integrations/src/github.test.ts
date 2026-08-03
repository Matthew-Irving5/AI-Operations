import { expect, it } from 'vitest';
import {
  ALLOWED_GITHUB_OWNER,
  listPersonalGithubRepositories,
  requirePersonalGithubOwner,
  validateGithubRepository,
} from './github';

it('accepts only Matthew-Irving5 GitHub repository evidence', () => {
  expect(requirePersonalGithubOwner(ALLOWED_GITHUB_OWNER)).toBe(ALLOWED_GITHUB_OWNER);
  expect(
    validateGithubRepository({
      id: 1,
      name: 'ai-operations',
      owner: { login: ALLOWED_GITHUB_OWNER },
      html_url: 'https://github.com/Matthew-Irving5/ai-operations',
      updated_at: '2026-08-03T00:00:00Z',
    }).name,
  ).toBe('ai-operations');
});

it('hard-denies BrightSG before any content processing', async () => {
  expect(() => requirePersonalGithubOwner('BrightSG')).toThrow('github_owner_hard_denied');
  await expect(
    listPersonalGithubRepositories(async () => ({
      ok: true,
      json: async () => [{ id: 7, name: 'denied', owner: { login: 'BrightSG' } }],
    })),
  ).rejects.toThrow('github_owner_hard_denied');
});
