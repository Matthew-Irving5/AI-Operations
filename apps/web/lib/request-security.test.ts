import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireSameOrigin } from './request-security';

describe('requireSameOrigin', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('accepts a same-origin mutation request', () => {
    expect(
      requireSameOrigin(
        new Request('https://operations.example/api/auth/mfa/verify', {
          headers: { origin: 'https://operations.example' },
        }),
      ),
    ).toBeUndefined();
  });

  it('rejects a missing or cross-origin request', async () => {
    const response = requireSameOrigin(
      new Request('https://operations.example/api/auth/mfa/verify', {
        headers: { origin: 'https://untrusted.example' },
      }),
    );
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({ code: 'origin_invalid' });
  });

  it('accepts the public host when the edge runtime URL uses an internal host', () => {
    const response = requireSameOrigin(
      new Request('https://internal-worker.example/api/auth/sign-in', {
        headers: {
          origin: 'https://ai-operations-production.ai-operations.workers.dev',
          host: 'ai-operations-production.ai-operations.workers.dev',
          'x-forwarded-proto': 'https',
        },
      }),
    );

    expect(response).toBeUndefined();
  });

  it('accepts public HTTPS when the edge reports an HTTP forwarding hop', () => {
    const response = requireSameOrigin(
      new Request('https://internal-worker.example/api/auth/sign-in', {
        headers: {
          origin: 'https://ai-operations-production.ai-operations.workers.dev',
          host: 'ai-operations-production.ai-operations.workers.dev',
          'x-forwarded-proto': 'http',
        },
      }),
    );

    expect(response).toBeUndefined();
  });

  it('uses the configured public origin instead of proxy-derived hosts', () => {
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://ai-operations-production.ai-operations.workers.dev');
    const accepted = requireSameOrigin(
      new Request('https://internal-worker.example/api/auth/sign-in', {
        headers: { origin: 'https://ai-operations-production.ai-operations.workers.dev' },
      }),
    );
    const rejected = requireSameOrigin(
      new Request('https://internal-worker.example/api/auth/sign-in', {
        headers: { origin: 'https://ai-operations-staging.ai-operations.workers.dev' },
      }),
    );

    expect(accepted).toBeUndefined();
    expect(rejected?.status).toBe(403);
  });

  it('accepts the page origin from Referer when the edge runtime host is internal', () => {
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://configured.example');
    const response = requireSameOrigin(
      new Request('https://internal-worker.example/api/auth/sign-in', {
        headers: {
          origin: 'https://ai-operations-production.ai-operations.workers.dev',
          referer: 'https://ai-operations-production.ai-operations.workers.dev/login',
        },
      }),
    );

    expect(response).toBeUndefined();
  });

  it('accepts an opaque browser origin only for same-origin fetch metadata', () => {
    const accepted = requireSameOrigin(
      new Request('https://operations.example/api/auth/sign-in', {
        headers: { origin: 'null', 'sec-fetch-site': 'same-origin' },
      }),
    );
    const rejected = requireSameOrigin(
      new Request('https://operations.example/api/auth/sign-in', {
        headers: { origin: 'null', 'sec-fetch-site': 'cross-site' },
      }),
    );

    expect(accepted).toBeUndefined();
    expect(rejected?.status).toBe(403);
  });
});
