import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { getAuthenticatedServerAccessToken } from '../../../../lib/supabase-server';

vi.mock('../../../../lib/supabase-server', () => ({
  getAuthenticatedServerAccessToken: vi.fn(),
}));

describe('career GitHub sync route', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedServerAccessToken).mockResolvedValue('user-session-token');
    vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects an injected owner before dispatching to the Edge Function', async () => {
    const request = new Request('https://app.example.test/api/career/github-sync', {
      method: 'POST',
      headers: { origin: 'https://app.example.test', 'content-type': 'application/json' },
      body: JSON.stringify({
        mfaGateId: '00000000-0000-4000-8000-000000000101',
        owner: 'BrightSG',
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'invalid_request' });
    expect(getAuthenticatedServerAccessToken).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
