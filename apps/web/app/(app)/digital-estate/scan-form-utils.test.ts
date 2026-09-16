import { describe, expect, it } from 'vitest';
import { removeScanResumeParam } from './scan-form-utils';

describe('removeScanResumeParam', () => {
  it('removes only the one-time resume marker and preserves other URL state', () => {
    expect(
      removeScanResumeParam(
        'https://operations.example/digital-estate?resume=scan_create&view=history#latest',
      ),
    ).toBe('/digital-estate?view=history#latest');
  });

  it('returns the normal Digital Estate path when resume is the only query parameter', () => {
    expect(removeScanResumeParam('/digital-estate?resume=scan_create')).toBe('/digital-estate');
  });
});
