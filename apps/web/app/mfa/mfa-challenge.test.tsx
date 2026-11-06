import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MfaChallenge } from './mfa-challenge';

describe('MFA challenge', () => {
  it('does not show enrolment loading when a verified factor is preselected', () => {
    const html = renderToStaticMarkup(
      <MfaChallenge
        availableFactors={[{ id: 'factor-1', friendlyName: 'AI Operations' }]}
        defaultFactorId="factor-1"
      />,
    );

    expect(html).not.toContain('Preparing secure authenticator enrolment');
    expect(html).toContain('Six-digit code');
  });

  it('preselects the shared human factor while keeping multiple verified factors selectable', () => {
    const html = renderToStaticMarkup(
      <MfaChallenge
        availableFactors={[
          { id: 'legacy-e2e', friendlyName: 'AI Operations staging live E2E' },
          { id: 'operator', friendlyName: 'AI Operations' },
        ]}
        defaultFactorId="operator"
      />,
    );

    expect(html).toContain('<select aria-label="Authenticator factor"');
    expect(html).toContain('<option value="operator" selected="">AI Operations</option>');
  });
});
