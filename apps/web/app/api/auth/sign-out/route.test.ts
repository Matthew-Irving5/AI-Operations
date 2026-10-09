import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { createSupabaseServerClient } from '../../../../lib/supabase-server';

const signOut = vi.fn();
vi.mock('../../../../lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe('sign out', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://example.test');
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ auth: { signOut } } as never);
    signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('rejects cross-origin sign-out before contacting Supabase', async () => {
    const response = await POST(
      new Request('https://example.test/api/auth/sign-out', {
        method: 'POST',
        headers: { origin: 'https://attacker.example' },
      }),
    );

    expect(response.status).toBe(403);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('revokes all sessions before reporting success', async () => {
    const response = await POST(
      new Request('https://example.test/api/auth/sign-out', {
        method: 'POST',
        headers: { origin: 'https://example.test' },
      }),
    );

    expect(response.status).toBe(200);
    expect(signOut).toHaveBeenCalledWith({ scope: 'global' });
    await expect(response.json()).resolves.toEqual({ signedOut: true });
  });

  it('does not report success when global session revocation fails', async () => {
    signOut.mockResolvedValueOnce({ error: new Error('revocation failed') });
    const response = await POST(
      new Request('https://example.test/api/auth/sign-out', {
        method: 'POST',
        headers: { origin: 'https://example.test' },
      }),
    );

    expect(response.status).toBe(503);
    expect(signOut).toHaveBeenCalledWith({ scope: 'global' });
    await expect(response.json()).resolves.toMatchObject({ code: 'session_revoke_failed' });
  });
});
