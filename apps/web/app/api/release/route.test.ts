import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

describe('release metadata route', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns only the validated deployed commit SHA without caching', async () => {
    vi.stubEnv('RELEASE_SHA', 'A'.repeat(40));

    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      schemaVersion: 1,
      releaseSha: 'a'.repeat(40),
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it.each([undefined, '', 'local-build', 'b'.repeat(39)])(
    'fails closed when RELEASE_SHA is unavailable or invalid (%s)',
    async (releaseSha) => {
      if (releaseSha === undefined) vi.stubEnv('RELEASE_SHA', '');
      else vi.stubEnv('RELEASE_SHA', releaseSha);

      const response = GET();

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        schemaVersion: 1,
        code: 'release_metadata_unavailable',
      });
      expect(response.headers.get('cache-control')).toBe('no-store');
    },
  );
});
