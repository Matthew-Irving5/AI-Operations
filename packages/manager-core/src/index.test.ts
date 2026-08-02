import { expect, it } from 'vitest';
import { requireIdempotencyKey } from './index';
it('requires a non-trivial idempotency key', () =>
  expect(() => requireIdempotencyKey('short')).toThrow('invalid_idempotency_key'));
