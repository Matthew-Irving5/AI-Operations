import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const googleRoleScopes = Object.freeze({
  personal_data_source: Object.freeze([
    'openid',
    'email',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events.owned',
    'https://www.googleapis.com/auth/tasks',
  ]),
  ai_operations_mailbox: Object.freeze([
    'openid',
    'email',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
  ]),
  ai_operations_mailbox_staging: Object.freeze([
    'openid',
    'email',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
  ]),
});
export function hashOAuthState(state: string): string {
  if (!/^[A-Za-z0-9_-]{32,200}$/.test(state)) throw new Error('invalid_oauth_state');
  return createHash('sha256').update(state).digest('hex');
}
export function encryptCredential(value: string, key: Uint8Array): string {
  if (key.byteLength !== 32 || !value) throw new Error('invalid_credential_encryption_input');
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  return [
    nonce.toString('base64url'),
    cipher.update(value, 'utf8', 'base64url') + cipher.final('base64url'),
    cipher.getAuthTag().toString('base64url'),
  ].join('.');
}
export function decryptCredential(payload: string, key: Uint8Array): string {
  const [nonce, ciphertext, tag] = payload.split('.');
  if (!nonce || !ciphertext || !tag || key.byteLength !== 32)
    throw new Error('invalid_encrypted_credential');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return decipher.update(ciphertext, 'base64url', 'utf8') + decipher.final('utf8');
}
export function requiresTokenRefresh(expiresAt: Date | null, now = new Date()): boolean {
  return expiresAt === null || expiresAt.getTime() <= now.getTime() + 60_000;
}
