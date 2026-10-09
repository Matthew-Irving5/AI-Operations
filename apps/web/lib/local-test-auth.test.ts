import { describe, expect, it } from 'vitest';
import { localAuthFailureDiagnostic } from './local-test-auth';

describe('local Auth failure diagnostics', () => {
  it('retains only provider status and a stable error code', () => {
    const diagnostic = localAuthFailureDiagnostic(401, {
      error_code: 'invalid_credentials',
      message: 'password=private email=owner@example.test',
      access_token: 'private-token',
    });

    expect(diagnostic).toEqual({ authStatus: 401, authCode: 'invalid_credentials' });
    expect(JSON.stringify(diagnostic)).not.toMatch(/private|owner@example/);
  });

  it('drops unstable or non-string provider codes', () => {
    expect(
      localAuthFailureDiagnostic(429, {
        error_code: 'provider says retry with private address owner@example.test',
        code: 429,
        message: 'private details',
      }),
    ).toEqual({ authStatus: 429 });
  });
});
