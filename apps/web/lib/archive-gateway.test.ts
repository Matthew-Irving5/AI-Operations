import { describe, expect, it } from 'vitest';
import {
  buildArchiveObjectKey,
  constantTimeEqual,
  sanitizeArchiveFilename,
  sha256Hex,
  verifyArchiveReadback,
} from './archive-gateway';

describe('archive gateway contracts', () => {
  it('compares secrets without accepting a different value', () => {
    expect(constantTimeEqual('gateway-secret', 'gateway-secret')).toBe(true);
    expect(constantTimeEqual('gateway-secret', 'wrong-secret')).toBe(false);
    expect(constantTimeEqual('gateway-secret', '')).toBe(false);
  });

  it('sanitizes filenames before putting them in an object key', () => {
    expect(sanitizeArchiveFilename('../bank statement.csv')).toBe('.._bank_statement.csv');
  });

  it('creates environment-scoped, date-partitioned finance keys', () => {
    expect(
      buildArchiveObjectKey(
        'production',
        '11111111-1111-4111-8111-111111111111',
        'abcdef1234567890',
        'statement.csv',
        'object-1',
        new Date('2026-09-24T12:00:00Z'),
      ),
    ).toBe(
      'prod/11111111-1111-4111-8111-111111111111/finance/2026/09/24/statement/ab/object-1-statement.csv',
    );
  });

  it('accepts only byte-identical read-back with matching R2 size, MIME, and SHA metadata', async () => {
    const bytes = new TextEncoder().encode('synthetic archive bytes');
    const sha256 = await sha256Hex(bytes);
    const expected = { sizeBytes: bytes.byteLength, contentType: 'text/csv', sha256 };

    await expect(
      verifyArchiveReadback(expected, {
        sizeBytes: bytes.byteLength,
        contentType: 'text/csv',
        sha256,
        bytes,
      }),
    ).resolves.toEqual({ actualSha256: sha256, mismatches: [] });

    const corrupt = new TextEncoder().encode('synthetic archive byteX');
    await expect(
      verifyArchiveReadback(expected, {
        sizeBytes: corrupt.byteLength,
        contentType: 'application/octet-stream',
        sha256,
        bytes: corrupt,
      }),
    ).resolves.toMatchObject({
      mismatches: expect.arrayContaining([
        expect.stringContaining('body SHA-256 expected'),
        expect.stringContaining('MIME type expected text/csv'),
      ]),
    });
  });
});
