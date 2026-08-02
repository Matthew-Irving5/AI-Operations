import { describe, expect, it } from 'vitest';
import { managerCodeSchema } from './index';
describe('manager contracts', () => {
  it('accepts only stable manager codes', () => {
    expect(managerCodeSchema.safeParse('finance').success).toBe(true);
    expect(managerCodeSchema.safeParse('unknown').success).toBe(false);
  });
});
