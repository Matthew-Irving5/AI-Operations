import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { createSupabaseServerClient } from '../../../../../../lib/supabase-server';
import { stagingTarget } from '../../../../../../lib/live-e2e-safety';

const auth = {
  getUser: vi.fn(),
  mfa: {
    getAuthenticatorAssuranceLevel: vi.fn(),
    listFactors: vi.fn(),
    enroll: vi.fn(),
  },
};

vi.mock('../../../../../../lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));
vi.mock('../../../../../../lib/auth', () => ({ isAllowedEmail: vi.fn(() => true) }));

describe('staging E2E factor enrollment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('PUBLIC_APP_ORIGIN', stagingTarget.origin);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', stagingTarget.supabaseUrl);
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ auth } as never);
    auth.getUser.mockResolvedValue({ data: { user: { email: 'matthewirving99@gmail.com' } } });
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal2' } });
    auth.mfa.listFactors.mockResolvedValue({ data: { all: [] } });
    auth.mfa.enroll.mockResolvedValue({
      data: {
        id: 'f0000000-0000-4000-8000-000000000001',
        totp: { qr_code: 'data:image/svg+xml;base64,abc', secret: 'NEVER-LOG-THIS-SECRET' },
      },
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  function request(origin = stagingTarget.origin) {
    return new Request(`${stagingTarget.origin}/api/auth/mfa/staging-e2e-factor/enroll`, {
      method: 'POST',
      headers: { origin },
    });
  }

  it('allows only locked staging AAL2 and returns one-time no-store enrollment material', async () => {
    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body).toMatchObject({ factorId: 'f0000000-0000-4000-8000-000000000001' });
    expect(auth.mfa.enroll).toHaveBeenCalledWith({
      factorType: 'totp',
      friendlyName: 'AI Operations staging live E2E',
    });
  });

  it('denies production, unauthenticated, and lower-assurance requests without enrollment', async () => {
    vi.stubEnv('APP_ENV', 'production');
    expect((await POST(request())).status).toBe(404);
    expect(auth.getUser).not.toHaveBeenCalled();

    vi.stubEnv('APP_ENV', 'staging');
    auth.getUser.mockResolvedValueOnce({ data: { user: null } });
    expect((await POST(request())).status).toBe(401);
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce({
      data: { currentLevel: 'aal1' },
    });
    expect((await POST(request())).status).toBe(403);
    expect(auth.mfa.enroll).not.toHaveBeenCalled();
  });

  it('prevents duplicates and supports retry after a pending factor is cancelled', async () => {
    auth.mfa.listFactors.mockResolvedValueOnce({
      data: {
        all: [
          {
            id: 'f0000000-0000-4000-8000-000000000002',
            factor_type: 'totp',
            friendly_name: 'AI Operations staging live E2E',
            status: 'unverified',
          },
        ],
      },
    });
    expect((await POST(request())).status).toBe(409);
    expect(auth.mfa.enroll).not.toHaveBeenCalled();

    auth.mfa.listFactors.mockResolvedValueOnce({ data: { all: [] } });
    expect((await POST(request())).status).toBe(200);
    expect(auth.mfa.enroll).toHaveBeenCalledTimes(1);
  });
});
