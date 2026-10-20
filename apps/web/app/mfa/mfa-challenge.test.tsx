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
});
