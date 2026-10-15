import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { createSupabaseServerClient } from '../../../../lib/supabase-server';

const resetPasswordForEmail = vi.fn();
vi.mock('../../../../lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

function request(email: string, origin = 'https://example.test') {
  const body = new FormData();
  body.set('email', email);
  return new Request('https://example.test/api/auth/password-reset', {
    method: 'POST',
    headers: { origin },
    body,
  });
}

describe('password recovery request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://example.test');
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { resetPasswordForEmail },
    } as never);
    resetPasswordForEmail.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('routes valid addresses through Auth and normalizes allowlisted and unknown responses', async () => {
    const eligibleStartedAt = performance.now();
    const eligible = await POST(request('matthewirving99@gmail.com'));
    const eligibleDuration = performance.now() - eligibleStartedAt;
    const unknownStartedAt = performance.now();
    const unknown = await POST(request('someone@example.test'));
    const unknownDuration = performance.now() - unknownStartedAt;

    expect(resetPasswordForEmail).toHaveBeenCalledTimes(2);
    expect(resetPasswordForEmail).toHaveBeenCalledWith('matthewirving99@gmail.com', {
      redirectTo: 'https://example.test/auth/callback?next=%2Freset-password',
    });
    expect(eligible.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await eligible.json()).toEqual(await unknown.json());
    expect(eligibleDuration).toBeGreaterThanOrEqual(390);
    expect(unknownDuration).toBeGreaterThanOrEqual(390);
  });

  it('waits for a slow Auth response on an unknown address without changing the public result', async () => {
    resetPasswordForEmail.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({ error: null }), 450)),
    );
    const startedAt = performance.now();

    const response = await POST(request('someone@example.test'));

    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(440);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: 'If the address is eligible, a recovery link will arrive shortly.',
    });
    expect(resetPasswordForEmail).toHaveBeenCalledWith('someone@example.test', {
      redirectTo: 'https://example.test/auth/callback?next=%2Freset-password',
    });
  });

  it('uses the same public result when the email provider fails', async () => {
    resetPasswordForEmail.mockResolvedValueOnce({ error: new Error('provider unavailable') });

    const response = await POST(request('matthewirving99@gmail.com'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: 'If the address is eligible, a recovery link will arrive shortly.',
    });
  });

  it('rejects cross-origin requests before contacting Auth', async () => {
    const response = await POST(request('matthewirving99@gmail.com', 'https://attacker.example'));

    expect(response.status).toBe(403);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('keeps a production recovery callback closed without the configured trusted origin', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.PUBLIC_APP_ORIGIN;

    const response = await POST(request('matthewirving99@gmail.com'));

    expect(response.status).toBe(200);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: 'If the address is eligible, a recovery link will arrive shortly.',
    });
  });
});
