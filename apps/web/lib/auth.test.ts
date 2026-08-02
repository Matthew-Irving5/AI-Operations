import { describe, expect, it } from 'vitest';
import { isAllowedEmail, requireRecentMfa } from './auth';
describe('access controls', () => {
  it('allows only the configured production identity', () => {
    expect(isAllowedEmail('MATTHEWIRVING99@gmail.com')).toBe(true);
    expect(isAllowedEmail('second@example.test')).toBe(false);
  });
  it('expires MFA step-up after five minutes', () => {
    const now = new Date('2026-08-02T12:00:00Z');
    expect(requireRecentMfa(new Date('2026-08-02T11:55:00Z'), now)).toBe(true);
    expect(requireRecentMfa(new Date('2026-08-02T11:54:59Z'), now)).toBe(false);
  });
});
