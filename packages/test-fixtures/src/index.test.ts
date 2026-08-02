import { expect, it } from 'vitest';
import { syntheticPrimaryUser } from './index';
it('contains only a synthetic fixture identity', () =>
  expect(syntheticPrimaryUser.id).toMatch(/^00000000/));
