import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isAllowedEmail, requireAal2, requireRecentMfa } from './auth';
import { createSupabaseServerClient } from './supabase-server';

const getUser = vi.fn();
const getAuthenticatorAssuranceLevel = vi.fn();
vi.mock('./supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));

describe('access controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        getUser,
        mfa: { getAuthenticatorAssuranceLevel },
      },
    } as never);
    getUser.mockResolvedValue({ data: { user: { email: 'matthewirving99@gmail.com' } } });
    getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal2' },
    });
  });

  it('allows only the configured production identity', () => {
    expect(isAllowedEmail('MATTHEWIRVING99@gmail.com')).toBe(true);
    expect(isAllowedEmail('second@example.test')).toBe(false);
  });
  it('expires MFA step-up after five minutes', () => {
    const now = new Date('2026-08-02T12:00:00Z');
    expect(requireRecentMfa(new Date('2026-08-02T11:55:00Z'), now)).toBe(true);
    expect(requireRecentMfa(new Date('2026-08-02T11:54:59Z'), now)).toBe(false);
  });

  it('allows the configured owner at AAL2 and redirects every AAL1 attempt', async () => {
    await expect(requireAal2()).resolves.toBeUndefined();

    getAuthenticatorAssuranceLevel.mockResolvedValueOnce({
      data: { currentLevel: 'aal1' },
    });
    await expect(requireAal2()).rejects.toThrow('NEXT_REDIRECT:/login');
  });

  it('rejects a non-allowlisted identity even when its token claims AAL2', async () => {
    getUser.mockResolvedValueOnce({ data: { user: { email: 'other@example.test' } } });

    await expect(requireAal2()).rejects.toThrow('NEXT_REDIRECT:/login');
  });
});
