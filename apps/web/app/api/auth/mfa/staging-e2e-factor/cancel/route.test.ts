import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { createSupabaseServerClient } from '../../../../../../lib/supabase-server';
import { stagingTarget } from '../../../../../../lib/live-e2e-safety';

const auth = {
  getUser: vi.fn(),
  mfa: {
    getAuthenticatorAssuranceLevel: vi.fn(),
    listFactors: vi.fn(),
    unenroll: vi.fn(),
  },
};
vi.mock('../../../../../../lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));
vi.mock('../../../../../../lib/auth', () => ({ isAllowedEmail: vi.fn(() => true) }));

describe('staging E2E pending factor cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_ENV', 'staging');
    vi.stubEnv('PUBLIC_APP_ORIGIN', stagingTarget.origin);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', stagingTarget.supabaseUrl);
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ auth } as never);
    auth.getUser.mockResolvedValue({ data: { user: { email: 'matthewirving99@gmail.com' } } });
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal2' } });
    auth.mfa.listFactors.mockResolvedValue({
      data: {
        all: [
          {
            id: 'f0000000-0000-4000-8000-000000000001',
            factor_type: 'totp',
            friendly_name: 'AI Operations staging live E2E',
            status: 'unverified',
          },
        ],
      },
    });
    auth.mfa.unenroll.mockResolvedValue({ error: null });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  function request(factorId = 'f0000000-0000-4000-8000-000000000001') {
    return new Request(`${stagingTarget.origin}/api/auth/mfa/staging-e2e-factor/cancel`, {
      method: 'POST',
      headers: { origin: stagingTarget.origin, 'content-type': 'application/json' },
      body: JSON.stringify({ factorId }),
    });
  }

  it('removes only the exact pending E2E factor after fresh AAL2', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(auth.mfa.unenroll).toHaveBeenCalledWith({
      factorId: 'f0000000-0000-4000-8000-000000000001',
    });
  });

  it('refuses verified, mismatched, and unauthorized factor removal', async () => {
    auth.mfa.listFactors.mockResolvedValueOnce({
      data: {
        all: [
          {
            id: 'f0000000-0000-4000-8000-000000000001',
            factor_type: 'totp',
            friendly_name: 'AI Operations staging live E2E',
            status: 'verified',
          },
        ],
      },
    });
    expect((await POST(request())).status).toBe(404);

    expect((await POST(request('f0000000-0000-4000-8000-000000000002'))).status).toBe(404);
    expect(auth.mfa.unenroll).not.toHaveBeenCalled();

    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValueOnce({
      data: { currentLevel: 'aal1' },
    });
    expect((await POST(request())).status).toBe(403);
    expect(auth.mfa.unenroll).not.toHaveBeenCalled();
  });
});
