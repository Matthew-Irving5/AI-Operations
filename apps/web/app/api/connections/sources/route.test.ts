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
