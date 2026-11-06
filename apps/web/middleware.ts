import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { parsePublicEnvironment } from './lib/env';
import { assertLocalTestAuthEnvironment } from './lib/local-test-auth';

export const contentSecurityPolicy = (nonce: string) =>
  [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://apis.google.com https://accounts.google.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://www.googleapis.com https://accounts.google.com",
    "frame-src 'self' https://docs.google.com https://accounts.google.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

export async function middleware(request: NextRequest) {
  assertLocalTestAuthEnvironment(process.env);
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const policy = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);

  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key } =
    parsePublicEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
  const responseCookies = new Map<string, { value: string; options: CookieOptions }>();
  const supabase = createServerClient(url, key, {
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (entries) => {
        entries.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          responseCookies.set(name, { value, options });
        });
        requestHeaders.set('cookie', request.cookies.toString());
      },
    },
  });
  await supabase.auth.getUser();

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  responseCookies.forEach(({ value, options }, name) => response.cookies.set(name, value, options));
  response.headers.set('Content-Security-Policy', policy);
  if (responseCookies.size > 0) response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
