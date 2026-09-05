import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GoogleOAuthStatus } from './google-oauth-status';

describe('Google OAuth status alert', () => {
  it('renders the profile-request failure prominently with its safe reference', () => {
    const html = renderToStaticMarkup(
      <GoogleOAuthStatus
        code="google_profile_request_failed"
        requestId="oauth-20260905-abc123"
        detail="provider body must never be rendered"
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('data-testid="google-oauth-error"');
    expect(html).toContain('Google account verification failed');
    expect(html).toContain('oauth-20260905-abc123');
    expect(html).not.toContain('provider body must never be rendered');
  });

  it('renders nothing when the callback has no safe error code', () => {
    expect(renderToStaticMarkup(<GoogleOAuthStatus requestId="ref-only" />)).toBe('');
  });
});
