import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { createSupabaseServerClient } from '../../../../../lib/supabase-server';

const auth = {
  getUser: vi.fn(),
  mfa: {
    listFactors: vi.fn(),
    getAuthenticatorAssuranceLevel: vi.fn(),
    enroll: vi.fn(),
  },
};
vi.mock('../../../../../lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe('regular MFA factor enrollment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://example.test');
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ auth } as never);
    auth.getUser.mockResolvedValue({ data: { user: { id: 'locked-user' } } });
    auth.mfa.listFactors.mockResolvedValue({ data: { all: [] } });
    auth.mfa.enroll.mockResolvedValue({
      data: { id: 'factor-id', totp: { qr_code: 'data:image/svg+xml;base64,abc', secret: 'seed' } },
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('preserves first-factor enrollment and does not expose setup material to caches', async () => {
    const response = await POST(
      new Request('https://example.test/api/auth/mfa/enroll', {
        method: 'POST',
        headers: { origin: 'https://example.test' },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('allows retry when the only existing factor is still unverified', async () => {
    auth.mfa.listFactors.mockResolvedValueOnce({
      data: { all: [{ id: 'pending', status: 'unverified' }] },
    });
    const response = await POST(
      new Request('https://example.test/api/auth/mfa/enroll', {
        method: 'POST',
        headers: { origin: 'https://example.test' },
      }),
    );
    expect(response.status).toBe(200);
    expect(auth.mfa.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
  });

  it('requires AAL2 to add another factor and fails closed if the factor list is unavailable', async () => {
    auth.mfa.listFactors.mockResolvedValueOnce({
      data: { all: [{ id: 'existing', status: 'verified' }] },
    });
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce({
      data: { currentLevel: 'aal1' },
    });
    const request = () =>
      new Request('https://example.test/api/auth/mfa/enroll', {
        method: 'POST',
        headers: { origin: 'https://example.test' },
      });
    expect((await POST(request())).status).toBe(403);
    expect(auth.mfa.enroll).not.toHaveBeenCalled();

    auth.mfa.listFactors.mockResolvedValueOnce({ data: null, error: new Error('unavailable') });
    expect((await POST(request())).status).toBe(503);
    expect(auth.mfa.enroll).not.toHaveBeenCalled();
  });
});
