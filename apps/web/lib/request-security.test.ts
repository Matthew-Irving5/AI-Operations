import { describe, expect, it } from 'vitest';
import { requireSameOrigin } from './request-security';

describe('requireSameOrigin', () => {
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
});
