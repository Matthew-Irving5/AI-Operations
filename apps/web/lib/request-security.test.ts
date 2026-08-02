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
});
