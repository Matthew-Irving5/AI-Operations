import { expect, it } from 'vitest';
import {
  decryptCredential,
  encryptCredential,
  hashOAuthState,
  requiresTokenRefresh,
} from './google';
it('hashes state and encrypts refresh tokens without retaining plaintext', () => {
  const key = Buffer.alloc(32, 7);
  const encrypted = encryptCredential('refresh-token', key);
  expect(encrypted).not.toContain('refresh-token');
  expect(decryptCredential(encrypted, key)).toBe('refresh-token');
  expect(hashOAuthState('a'.repeat(32))).toHaveLength(64);
});
it('requires refresh shortly before token expiry', () =>
  expect(
    requiresTokenRefresh(new Date('2026-08-03T00:00:30Z'), new Date('2026-08-03T00:00:00Z')),
  ).toBe(true));
