import { describe, expect, it } from 'vitest';
import { redact } from './index';
describe('redaction', () => {
  it('redacts sensitive values before trace persistence', () => {
    expect(redact({ token: 'secret', safe: 'value' })).toEqual({
      token: '[REDACTED]',
      safe: 'value',
    });
  });
});
