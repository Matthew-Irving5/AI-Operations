import { describe, expect, it } from 'vitest';
import {
  buildArchiveObjectKey,
  constantTimeEqual,
  sanitizeArchiveFilename,
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
});
