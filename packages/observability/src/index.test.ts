import { expect, it } from 'vitest';
import { redactTraceFields } from './index';
it('redacts credentials from structured trace fields', () =>
  expect(redactTraceFields({ token: 'nope', run: 'safe' })).toEqual({
    token: '[REDACTED]',
    run: 'safe',
  }));
