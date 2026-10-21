import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';
import { getAuthenticatedServerAccessToken } from '../../../../lib/supabase-server';

vi.mock('../../../../lib/supabase-server', () => ({
  getAuthenticatedServerAccessToken: vi.fn(),
}));

const connectionId = '6a598d20-8fae-4c8c-b809-1bd3d90d4053';

describe('Google connection sources route', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    vi.mocked(getAuthenticatedServerAccessToken).mockResolvedValue('access-token');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ requestId: 'request-123', calendars: [], driveFiles: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-request-id': 'request-123' },
      }),
    );
  });

  afterEach(() => vi.restoreAllMocks());

  it('allows a browser GET without an Origin header and forwards the request ID', async () => {
    const response = await GET(
      new Request(
        `https://operations.example/api/connections/sources?connectionId=${connectionId}`,
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toBe('request-123');
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it('denies an unauthenticated read before calling the Edge Function', async () => {
    vi.mocked(getAuthenticatedServerAccessToken).mockResolvedValueOnce(null);

    const response = await GET(
      new Request(
        `https://operations.example/api/connections/sources?connectionId=${connectionId}`,
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: 'unauthorised' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('forwards only the supported Picker configuration operation without caching', async () => {
    const response = await GET(
      new Request(
        `https://operations.example/api/connections/sources?connectionId=${connectionId}&operation=picker_config`,
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const upstream = vi.mocked(globalThis.fetch).mock.calls.at(0)?.[0];
    expect(upstream).toBeDefined();
    expect(new URL(String(upstream)).searchParams.get('operation')).toBe('picker_config');
  });

  it('rejects unknown source read operations before calling the Edge Function', async () => {
    const response = await GET(
      new Request(
        `https://operations.example/api/connections/sources?connectionId=${connectionId}&operation=all_drive_files`,
      ),
    );

    expect(response.status).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('retains the same-origin guard for POST', async () => {
    const response = await POST(
      new Request('https://operations.example/api/connections/sources', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(403);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
