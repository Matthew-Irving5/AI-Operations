import { describe, expect, it } from 'vitest';
import { selectMfaFactors } from './mfa-factor-selection';

describe('MFA factor selection', () => {
  it('defaults to a human factor and leaves every verified factor selectable', () => {
    const selection = selectMfaFactors([
      {
        id: 'legacy-e2e',
        status: 'verified',
        friendly_name: 'AI Operations staging live E2E',
      },
      { id: 'operator', status: 'verified', friendly_name: 'AI Operations' },
      { id: 'pending', status: 'unverified', friendly_name: 'Pending factor' },
    ]);

    expect(selection).toEqual({
      availableFactors: [
        { id: 'legacy-e2e', friendlyName: 'AI Operations staging live E2E' },
        { id: 'operator', friendlyName: 'AI Operations' },
      ],
      defaultFactorId: 'operator',
    });
  });

  it('uses the first verified factor only when no non-legacy factor exists', () => {
    expect(
      selectMfaFactors([
        {
          id: 'legacy-e2e',
          status: 'verified',
          friendly_name: 'AI Operations staging live E2E',
        },
      ]),
    ).toEqual({
      availableFactors: [{ id: 'legacy-e2e', friendlyName: 'AI Operations staging live E2E' }],
      defaultFactorId: 'legacy-e2e',
    });
  });

  it('returns no default when there is no verified factor', () => {
    expect(selectMfaFactors([{ id: 'pending', status: 'unverified' }])).toEqual({
      availableFactors: [],
    });
  });
});
