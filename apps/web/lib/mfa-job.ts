import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export type MfaJob = 'apple_bridge' | 'gmail_test';
const cookieName = 'ai_mfa_job';

export async function readMfaJobToken(job: MfaJob): Promise<string | null> {
  const value = (await cookies()).get(cookieName)?.value;
  if (!value) return null;
  const [storedJob, ...encodedToken] = value.split('.');
  if (storedJob !== job || !encodedToken.length) return null;
  try {
    return decodeURIComponent(encodedToken.join('.'));
  } catch {
    return null;
  }
}

export function clearMfaJob(response: NextResponse): NextResponse {
  response.cookies.set({ name: cookieName, value: '', maxAge: 0, path: '/api' });
  return response;
}

export function setMfaJobCookie(response: NextResponse, job: MfaJob, accessToken: string) {
  response.cookies.set({
    name: cookieName,
    value: `${job}.${encodeURIComponent(accessToken)}`,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 120,
    path: '/api',
  });
}
