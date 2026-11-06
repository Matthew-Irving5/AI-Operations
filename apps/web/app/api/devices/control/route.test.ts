import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { getAuthenticatedServerAccessToken } from '../../../../lib/supabase-server';

vi.mock('../../../../lib/supabase-server', () => ({
  getAuthenticatedServerAccessToken: vi.fn(),
}));

describe('worker control route', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    vi.mocked(getAuthenticatedServerAccessToken).mockResolvedValue('session-token');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            device_id: '00000000-0000-4000-8000-000000000001',
            desired_state: 'online',
            control_generation: 1,
          },
        ]),
        { status: 200 },
      ),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const request = (body: unknown) =>
    new Request('https://app.example.test/api/devices/control', {
      method: 'POST',
      headers: { origin: 'https://app.example.test', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('forwards the authenticated desired-state RPC request', async () => {
    const response = await POST(
      request({ deviceId: '00000000-0000-4000-8000-000000000001', desiredState: 'online' }),
    );
    expect(response.status).toBe(200);
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe('https://project.supabase.co/rest/v1/rpc/set_worker_desired_state');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(
      JSON.stringify({
        p_device_id: '00000000-0000-4000-8000-000000000001',
        p_desired_state: 'online',
      }),
    );
    expect(init.headers).toMatchObject({
      authorization: 'Bearer session-token',
      apikey: 'anon-key',
    });
  });

  it('rejects malformed, cross-origin and unauthenticated requests', async () => {
    expect((await POST(request({ deviceId: 'not-a-uuid', desiredState: 'online' }))).status).toBe(
      400,
    );
    const crossOrigin = new Request('https://app.example.test/api/devices/control', {
      method: 'POST',
      headers: { origin: 'https://untrusted.example', 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId: '00000000-0000-4000-8000-000000000001',
        desiredState: 'online',
      }),
    });
    expect((await POST(crossOrigin)).status).toBe(403);
    vi.mocked(getAuthenticatedServerAccessToken).mockResolvedValueOnce(null);
    expect(
      (
        await POST(
          request({ deviceId: '00000000-0000-4000-8000-000000000001', desiredState: 'online' }),
        )
      ).status,
    ).toBe(401);
  });
});
