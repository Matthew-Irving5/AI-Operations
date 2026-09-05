import { describe, expect, it } from 'vitest';
import { googleOAuthErrorView } from './google-oauth-error';

describe('Google OAuth callback error view', () => {
  it('explains an unapproved Google account and preserves the support reference', () => {
    const view = googleOAuthErrorView({
      code: 'google_account_not_allowed',
      requestId: 'oauth-20260905-abc123',
      detail: 'unexpected account: private@example.com',
    });
    expect(view?.title).toMatch(/not approved/i);
    expect(view?.message).toMatch(/different from the approved/i);
    expect(view?.action).toContain('matthewirving99@gmail.com');
    expect(view?.requestId).toBe('oauth-20260905-abc123');
    expect(JSON.stringify(view)).not.toContain('private@example.com');
  });

  it('gives distinct recovery guidance for incomplete scopes', () => {
    const view = googleOAuthErrorView({ code: 'google_scopes_invalid' });
    expect(view?.message).toMatch(/complete set of permissions/i);
    expect(view?.action).toMatch(/every requested permission/i);
  });

  it.each([
    ['google_profile_request_failed', /account verification failed/i],
    ['google_profile_incomplete', /incomplete account profile/i],
    ['google_account_not_verified', /could not verify/i],
    ['google_token_exchange_failed', /usable credential/i],
  ])('explains the exact %s callback boundary', (code, title) => {
    expect(googleOAuthErrorView({ code })?.title).toMatch(title);
  });

  it('does not render provider details or malformed references for unknown errors', () => {
    const view = googleOAuthErrorView({
      code: 'provider_error',
      detail: 'access_token=secret-value',
      requestId: 'x'.repeat(129),
    });
    expect(view?.message).toBe('AI Operations could not complete Google authorisation.');
    expect(view?.requestId).toBeNull();
    expect(JSON.stringify(view)).not.toContain('secret-value');
  });

  it('ignores a missing or blank code', () => {
    expect(googleOAuthErrorView({})).toBeNull();
    expect(googleOAuthErrorView({ code: '   ' })).toBeNull();
  });
});
