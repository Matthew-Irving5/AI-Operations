import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { createSupabaseServerClient } from '../../../lib/supabase-server';
import {
  fingerprintRecoverySession,
  passwordRecoveryCookieName,
} from '../../../lib/password-recovery';

const auth = {
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
};
vi.mock('../../../lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe('recovery callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://example.test');
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ auth } as never);
    auth.exchangeCodeForSession.mockResolvedValue({ error: null });
    auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'matthewirving99@gmail.com' } },
    });
    auth.getSession.mockResolvedValue({ data: { session: { access_token: 'recovery-token' } } });
    auth.signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('exchanges the PKCE code and issues a short-lived HttpOnly recovery marker', async () => {
    const response = await GET(
      new Request(
        'https://example.test/auth/callback?code=one-time-code&next=https://attacker.test',
      ),
    );

    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('one-time-code');
    expect(response.headers.get('location')).toBe('https://example.test/reset-password');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const cookie = response.cookies.get(passwordRecoveryCookieName);
    expect(cookie?.value).toBe(await fingerprintRecoverySession('recovery-token'));
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
  });

  it('rejects missing codes without creating an Auth session', async () => {
    const response = await GET(new Request('https://example.test/auth/callback'));

    expect(response.headers.get('location')).toBe('https://example.test/login?error=recovery');
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('fails closed in production if the trusted application origin is missing', async () => {
    vi.stubEnv('PUBLIC_APP_ORIGIN', '');
    const response = await GET(
      new Request('https://attacker.example/auth/callback?code=one-time-code'),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: 'public_app_origin_invalid' });
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('revokes and rejects a recovery session for any other identity', async () => {
    auth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-2', email: 'someone@example.test' } },
    });
    const response = await GET(
      new Request('https://example.test/auth/callback?code=one-time-code'),
    );

    expect(response.headers.get('location')).toBe('https://example.test/login?error=recovery');
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'global' });
    expect(response.cookies.get(passwordRecoveryCookieName)).toBeUndefined();
  });
});
