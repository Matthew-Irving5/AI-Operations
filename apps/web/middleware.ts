import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'experimental-edge';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const nonce = crypto.randomUUID();
  const scriptPolicy =
    process.env.NODE_ENV === 'development' ? "'self' 'unsafe-eval'" : `'self' 'nonce-${nonce}'`;
  response.headers.set(
    'Content-Security-Policy',
    `default-src 'self'; script-src ${scriptPolicy}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
  );
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
}

export const config = { matcher: '/:path*' };
