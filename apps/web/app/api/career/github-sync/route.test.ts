import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { getAuthenticatedServerAccessToken } from '../../../../lib/supabase-server';

vi.mock('../../../../lib/supabase-server', () => ({
  getAuthenticatedServerAccessToken: vi.fn(),
}));

describe('career GitHub sync route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.example.test');
    vi.mocked(getAuthenticatedServerAccessToken).mockResolvedValue('user-session-token');
    vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([
    ['BrightSG', 'github_owner_hard_denied'],
    ['OtherOwner', 'github_owner_not_allowlisted'],
  ])('forwards a denied owner target to the audited Edge boundary (%s)', async (owner, code) => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ code, requestId: 'safe-request-id' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const request = new Request('https://app.example.test/api/career/github-sync', {
      method: 'POST',
      headers: { origin: 'https://app.example.test', 'content-type': 'application/json' },
      body: JSON.stringify({ owner }),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code, requestId: 'safe-request-id' });
    expect(getAuthenticatedServerAccessToken).toHaveBeenCalledOnce();
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({ owner });
  });

  it('rejects unsupported fields before dispatching to the Edge Function', async () => {
    const request = new Request('https://app.example.test/api/career/github-sync', {
      method: 'POST',
      headers: { origin: 'https://app.example.test', 'content-type': 'application/json' },
      body: JSON.stringify({
        mfaGateId: '00000000-0000-4000-8000-000000000101',
        unexpectedField: true,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'invalid_request' });
    expect(getAuthenticatedServerAccessToken).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
