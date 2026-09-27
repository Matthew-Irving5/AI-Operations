import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { getAuthenticatedServerAccessToken } from '../../../../../lib/supabase-server';
import { stagingTarget } from '../../../../../lib/live-e2e-safety';

vi.mock('../../../../../lib/supabase-server', () => ({
  getAuthenticatedServerAccessToken: vi.fn(),
}));

describe('staging AAL2 Edge probe route', () => {
  beforeEach(() => {
    vi.stubEnv('PUBLIC_APP_ORIGIN', stagingTarget.origin);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', stagingTarget.supabaseUrl);
    vi.mocked(getAuthenticatedServerAccessToken).mockResolvedValue('never-return-this-token');
    vi.mocked(getAuthenticatedServerAccessToken).mockClear();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'invalid_plan' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  function sameOriginRequest(body = '{}') {
    return new Request(`${stagingTarget.origin}/api/auth/mfa/aal2-probe`, {
      method: 'POST',
      headers: {
        origin: stagingTarget.origin,
        'content-type': 'application/json',
      },
      body,
    });
  }

  it('forwards only the fixed empty payload to the exact staging Edge Function', async () => {
    const result = await POST(sameOriginRequest());
    const body = (await result.json()) as Record<string, unknown>;

    expect(result.status).toBe(200);
    expect(body).toMatchObject({ status: 400, code: 'invalid_plan' });
    expect(body.probeId).toEqual(expect.any(String));
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(JSON.stringify(body)).not.toContain('never-return-this-token');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${stagingTarget.supabaseUrl}/functions/v1/digital-plan-approve`,
      expect.objectContaining({
        method: 'POST',
        body: '{}',
        redirect: 'error',
        cache: 'no-store',
        headers: expect.objectContaining({
          authorization: 'Bearer never-return-this-token',
          'content-type': 'application/json',
        }),
      }),
    );
  });

  it('is unavailable when the app origin or Supabase project is not the exact staging target', async () => {
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://ai-operations-production.ai-operations.workers.dev');
    const productionOrigin = 'https://ai-operations-production.ai-operations.workers.dev';
    const productionRequest = new Request(`${productionOrigin}/api/auth/mfa/aal2-probe`, {
      method: 'POST',
      headers: { origin: productionOrigin, 'content-type': 'application/json' },
      body: '{}',
    });

    const productionResult = await POST(productionRequest);
    expect(productionResult.status).toBe(404);
    expect(getAuthenticatedServerAccessToken).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();

    vi.stubEnv('PUBLIC_APP_ORIGIN', stagingTarget.origin);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://production-project.supabase.co');
    const swappedResult = await POST(sameOriginRequest());
    expect(swappedResult.status).toBe(404);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rejects malformed payloads and unauthenticated sessions before calling Supabase Edge', async () => {
    const malformed = await POST(sameOriginRequest('{"planId":"user-controlled"}'));
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({
      status: 400,
      code: 'invalid_probe_request',
    });
    expect(getAuthenticatedServerAccessToken).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();

    vi.mocked(getAuthenticatedServerAccessToken).mockResolvedValueOnce(null);
    const unauthenticated = await POST(sameOriginRequest());
    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toMatchObject({ code: 'unauthorised' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rejects missing and cross-origin request origins before authentication', async () => {
    const missingOrigin = new Request(`${stagingTarget.origin}/api/auth/mfa/aal2-probe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const crossOrigin = new Request(`${stagingTarget.origin}/api/auth/mfa/aal2-probe`, {
      method: 'POST',
      headers: {
        origin: 'https://untrusted.example',
        'content-type': 'application/json',
      },
      body: '{}',
    });

    expect((await POST(missingOrigin)).status).toBe(403);
    expect((await POST(crossOrigin)).status).toBe(403);
    expect(getAuthenticatedServerAccessToken).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not pass through an unexpected Edge response body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'unexpected', token: 'sensitive-upstream-body' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = await POST(sameOriginRequest());
    const body = (await result.json()) as Record<string, unknown>;

    expect(body).toMatchObject({ status: 500, code: 'invalid_edge_response' });
    expect(JSON.stringify(body)).not.toContain('sensitive-upstream-body');
  });
});
