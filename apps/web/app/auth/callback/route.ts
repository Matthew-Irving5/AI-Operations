import { NextResponse } from 'next/server';
import { isAllowedEmail } from '../../../lib/auth';
import {
  fingerprintRecoverySession,
  passwordRecoveryCookieName,
  passwordRecoveryTtlSeconds,
} from '../../../lib/password-recovery';
import { createSupabaseServerClient } from '../../../lib/supabase-server';

function appOrigin(request: Request) {
  const configuredOrigin = process.env.PUBLIC_APP_ORIGIN;
  if (process.env.NODE_ENV === 'production' && !configuredOrigin) {
    throw new Error('public_app_origin_required');
  }
  const origin = configuredOrigin ?? new URL(request.url).origin;
  const parsed = new URL(origin);
  if (
    parsed.origin !== origin ||
    (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:')
  ) {
    throw new Error('public_app_origin_invalid');
  }
  return parsed;
}

function redirectWithError(origin: URL) {
  const target = new URL('/login', origin);
  target.searchParams.set('error', 'recovery');
  const response = NextResponse.redirect(target, 303);
  response.headers.set('cache-control', 'no-store');
  return response;
}

export async function GET(request: Request) {
  let origin: URL;
  try {
    origin = appOrigin(request);
  } catch {
    return NextResponse.json({ code: 'public_app_origin_invalid' }, { status: 500 });
  }

  const code = new URL(request.url).searchParams.get('code');
  if (!code) return redirectWithError(origin);

  const supabase = await createSupabaseServerClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) return redirectWithError(origin);

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user || !isAllowedEmail(userData.user.email ?? '')) {
    await supabase.auth.signOut({ scope: 'global' });
    return redirectWithError(origin);
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken) return redirectWithError(origin);

  const response = NextResponse.redirect(new URL('/reset-password', origin), 303);
  response.cookies.set(passwordRecoveryCookieName, await fingerprintRecoverySession(accessToken), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: passwordRecoveryTtlSeconds,
  });
  response.headers.set('cache-control', 'no-store');
  return response;
}
