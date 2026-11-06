import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuthenticatedServerAccessToken } from '../../../lib/supabase-server';
import { POST } from './route';

vi.mock('../../../lib/supabase-server', () => ({
  getAuthenticatedServerAccessToken: vi.fn(),
}));

describe('prompt governance route', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.example.test');
    vi.mocked(getAuthenticatedServerAccessToken).mockResolvedValue('user-session-token');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ templateId: '00000000-0000-4000-8000-000000000101' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  function sameOriginRequest(body: unknown) {
    return new Request('https://app.example.test/api/prompt-governance', {
      method: 'POST',
      headers: { origin: 'https://app.example.test', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('forwards only allowlisted governance requests with the server session token', async () => {
    const request = { operation: 'get_current' };
    const response = await POST(sameOriginRequest(request));

    expect(response.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://project.example.test/functions/v1/prompt-governance',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(request),
        headers: expect.objectContaining({ authorization: 'Bearer user-session-token' }),
      }),
    );
  });

  it('forwards only the approved Planner template code for current prompt lookup', async () => {
    const request = {
      operation: 'get_current',
      templateCode: 'planner-agent-report',
    };
    const response = await POST(sameOriginRequest(request));
    expect(response.status).toBe(200);
    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual(request);
    expect(
      (
        await POST(
          sameOriginRequest({
            operation: 'get_current',
            templateCode: 'unrestricted-template',
          }),
        )
      ).status,
    ).toBe(400);
  });

  it('rejects unsupported, cross-origin, and unauthenticated requests before forwarding', async () => {
    expect((await POST(sameOriginRequest({ operation: 'read_prompt_table' }))).status).toBe(400);

    const crossOrigin = new Request('https://app.example.test/api/prompt-governance', {
      method: 'POST',
      headers: { origin: 'https://untrusted.example', 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'get_current' }),
    });
    expect((await POST(crossOrigin)).status).toBe(403);

    vi.mocked(getAuthenticatedServerAccessToken).mockResolvedValueOnce(null);
    expect((await POST(sameOriginRequest({ operation: 'get_current' }))).status).toBe(401);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
