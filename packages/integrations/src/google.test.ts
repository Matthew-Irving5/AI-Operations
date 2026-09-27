import { expect, it } from 'vitest';
import {
  decryptCredential,
  encryptCredential,
  hashOAuthState,
  googleRoleScopes,
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

it('keeps data-source and communication-mailbox grants separate', () => {
  expect(googleRoleScopes.personal_data_source).toEqual([
    'openid',
    'email',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events.owned',
    'https://www.googleapis.com/auth/tasks',
  ]);
  expect(googleRoleScopes.ai_operations_mailbox).toEqual([
    'openid',
    'email',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
  ]);
  expect(googleRoleScopes.ai_operations_mailbox_staging).toEqual(
    googleRoleScopes.ai_operations_mailbox,
  );
});
