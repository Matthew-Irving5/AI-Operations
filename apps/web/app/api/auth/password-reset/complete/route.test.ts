import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { createSupabaseServerClient } from '../../../../../lib/supabase-server';
import { fingerprintRecoverySession } from '../../../../../lib/password-recovery';
import { cookies } from 'next/headers';

const auth = {
  getUser: vi.fn(),
  getSession: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
};
let recoveryCookieValue: string | undefined;
const setCookie = vi.fn();
vi.mock('../../../../../lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));

function request(password = 'LongEnoughPassphrase42') {
  return new Request('https://example.test/api/auth/password-reset/complete', {
    method: 'POST',
    headers: { origin: 'https://example.test', 'content-type': 'application/json' },
    body: JSON.stringify({ password, confirmPassword: password }),
  });
}

describe('complete password recovery', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://example.test');
    vi.stubEnv('NODE_ENV', 'production');
    recoveryCookieValue = await fingerprintRecoverySession('recovery-access-token');
    vi.mocked(cookies).mockResolvedValue({
      get: (name: string) =>
        name === 'aiops_password_recovery' && recoveryCookieValue
          ? { value: recoveryCookieValue }
          : undefined,
      set: setCookie,
    } as never);
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ auth } as never);
    auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'matthewirving99@gmail.com' } },
    });
    auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'recovery-access-token' } },
    });
    auth.updateUser.mockResolvedValue({ error: null });
    auth.signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('requires the callback-issued recovery marker tied to the validated session', async () => {
    recoveryCookieValue = undefined;
    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('updates the allowlisted account and revokes every session', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'LongEnoughPassphrase42' });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'global' });
    expect(setCookie).toHaveBeenCalledWith(
      'aiops_password_recovery',
      '',
      expect.objectContaining({ maxAge: 0, httpOnly: true, secure: true }),
    );
  });

  it('does not change passwords for a non-allowlisted session', async () => {
    auth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-2', email: 'someone@example.test' } },
    });
    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('requires a long password and matching confirmation', async () => {
    const response = await POST(request('short'));

    expect(response.status).toBe(400);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('does not report completion if global session revocation fails', async () => {
    auth.signOut.mockResolvedValueOnce({ error: new Error('revocation failed') });
    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: 'session_revoke_failed' });
  });
});
