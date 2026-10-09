import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { getAuthenticatedServerAccessToken } from '../../../../lib/supabase-server';

vi.mock('../../../../lib/supabase-server', () => ({
  getAuthenticatedServerAccessToken: vi.fn(),
}));

describe('canonical agent runtime route', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://jqtssfrfocnibffdkqch.supabase.co');
    vi.mocked(getAuthenticatedServerAccessToken).mockResolvedValue('user-session-token');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ conversationId: '00000000-0000-4000-8000-000000000101' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  function sameOriginRequest(body: unknown) {
    return new Request('https://app.example.test/api/agent-runtime/contracts', {
      method: 'POST',
      headers: { origin: 'https://app.example.test', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('forwards the validated fixture request with only the authenticated user token', async () => {
    const fixtureRequest = {
      operation: 'create_fixture',
      fixtureKey: 'ai14-live-e2e:00000000-0000-4000-8000-000000000101',
    };
    const response = await POST(sameOriginRequest(fixtureRequest));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ conversationId: expect.any(String) });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://jqtssfrfocnibffdkqch.supabase.co/functions/v1/agent-runtime-contracts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(fixtureRequest),
        headers: expect.objectContaining({ authorization: 'Bearer user-session-token' }),
      }),
    );
  });

  it('rejects malformed, cross-origin and unauthenticated requests before the Edge Function', async () => {
    const malformed = await POST(
      sameOriginRequest({ operation: 'create_fixture', fixtureKey: 'wrong' }),
    );
    expect(malformed.status).toBe(400);

    const crossOrigin = new Request('https://app.example.test/api/agent-runtime/contracts', {
      method: 'POST',
      headers: { origin: 'https://untrusted.example', 'content-type': 'application/json' },
      body: JSON.stringify({
        operation: 'read_fixture',
        conversationId: '00000000-0000-4000-8000-000000000101',
      }),
    });
    expect((await POST(crossOrigin)).status).toBe(403);

    vi.mocked(getAuthenticatedServerAccessToken).mockResolvedValueOnce(null);
    const unauthenticated = await POST(
      sameOriginRequest({
        operation: 'read_fixture',
        conversationId: '00000000-0000-4000-8000-000000000101',
      }),
    );
    expect(unauthenticated.status).toBe(401);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns a bounded transport error without exposing upstream exception details', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new TypeError('sensitive connection detail'),
    );
    const response = await POST(
      sameOriginRequest({
        operation: 'read_fixture',
        conversationId: '00000000-0000-4000-8000-000000000101',
      }),
    );

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toEqual({ code: 'agent_runtime_unavailable' });
    expect(JSON.stringify(body)).not.toContain('sensitive connection detail');
  });
});
