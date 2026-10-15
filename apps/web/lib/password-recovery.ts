export const passwordRecoveryCookieName = 'aiops_password_recovery';
export const passwordRecoveryTtlSeconds = 10 * 60;

export async function fingerprintRecoverySession(accessToken: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessToken));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
