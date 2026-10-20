import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';
import { createSupabaseServerClient } from '../../../../lib/supabase-server';

const signInWithPassword = vi.fn();
vi.mock('../../../../lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

function request(
  email: string,
  password = 'long-enough-password',
  origin = 'https://example.test',
  requestUrl = 'https://example.test/api/auth/sign-in',
) {
  const body = new FormData();
  body.set('email', email);
  body.set('password', password);
  return new Request(requestUrl, {
    method: 'POST',
    headers: { origin },
    body,
  });
}

describe('sign in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://example.test');
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { signInWithPassword },
    } as never);
    signInWithPassword.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('uses the configured public origin for the login redirect', () => {
    const response = GET(new Request('https://internal-worker.example/api/auth/sign-in'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://example.test/login');
  });

  it('routes an allowlisted password session to mandatory MFA on the configured public origin', async () => {
    const response = await POST(
      request(
        'matthewirving99@gmail.com',
        'long-enough-password',
        'https://example.test',
        'https://internal-worker.example/api/auth/sign-in',
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://example.test/mfa');
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it('uses the same public error for unknown identities and invalid credentials', async () => {
    const unknown = await POST(request('someone@example.test'));
    signInWithPassword.mockResolvedValueOnce({ error: new Error('invalid credentials') });
    const invalid = await POST(
      request(
        'matthewirving99@gmail.com',
        'long-enough-password',
        'https://example.test',
        'https://internal-worker.example/api/auth/sign-in',
      ),
    );

    expect(unknown.status).toBe(303);
    expect(invalid.status).toBe(303);
    expect(unknown.headers.get('location')).toBe('https://example.test/login?error=invalid');
    expect(invalid.headers.get('location')).toBe('https://example.test/login?error=invalid');
    expect(createSupabaseServerClient).toHaveBeenCalledTimes(1);
  });

  it('rejects cross-origin attempts before contacting Supabase', async () => {
    const response = await POST(
      request('matthewirving99@gmail.com', undefined, 'https://attacker.example'),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://example.test/login?error=security');
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });
});
