import { describe, expect, it } from 'vitest';
import { parseLiveE2eEnvironment, stagingTarget } from './live-e2e-safety';

const valid = {
  LIVE_E2E_BASE_URL: stagingTarget.origin,
  LIVE_E2E_SUPABASE_URL: stagingTarget.supabaseUrl,
  LIVE_E2E_SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key-not-a-real-secret',
  LIVE_E2E_EMAIL: 'qa@example.test',
  LIVE_E2E_PASSWORD: 'synthetic-test-password',
  LIVE_E2E_TOTP_SECRET: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
};

describe('live E2E staging target guard', () => {
  it('accepts only the explicitly configured staging app and Supabase project', () => {
    expect(parseLiveE2eEnvironment(valid, 'suite')).toMatchObject(valid);
  });

  it('fails closed before making a request when the base origin points elsewhere', () => {
    expect(() =>
      parseLiveE2eEnvironment({ ...valid, LIVE_E2E_BASE_URL: 'https://app.example.com' }, 'suite'),
    ).toThrow(/fixed staging origin/);
  });

  it('fails closed when Supabase points to another project or production endpoint', () => {
    expect(() =>
      parseLiveE2eEnvironment(
        { ...valid, LIVE_E2E_SUPABASE_URL: 'https://production-project.supabase.co' },
        'suite',
      ),
    ).toThrow(/fixed staging origin/);
  });

  it('fails closed when the staging origin contains a path or query override', () => {
    expect(() =>
      parseLiveE2eEnvironment(
        { ...valid, LIVE_E2E_BASE_URL: `${stagingTarget.origin}/proxy?target=production` },
        'suite',
      ),
    ).toThrow(/fixed staging origin/);
  });

  it('rejects swapped origin and project even when both are structurally valid URLs', () => {
    const swapped = parseLiveE2eEnvironment(
      {
        ...valid,
        LIVE_E2E_BASE_URL: 'https://app.example.com',
        LIVE_E2E_SUPABASE_URL: 'https://production-project.supabase.co',
      },
      'mismatch',
    );
    expect(() => parseLiveE2eEnvironment(swapped, 'suite')).toThrow(/fixed staging origin/);
  });
});
