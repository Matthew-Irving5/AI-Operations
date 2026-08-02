import { expect, it } from 'vitest';
import { canReserveCost } from './index';
it('does not permit a cost reservation above its hard cap', () =>
  expect(canReserveCost(10.01, 10)).toBe(false));
