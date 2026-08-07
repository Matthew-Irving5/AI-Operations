import { NextResponse } from 'next/server';

/** Reject cross-site state-changing requests before they reach Supabase. */
export function requireSameOrigin(request: Request): NextResponse | undefined {
  const origin = request.headers.get('origin');
  if (!origin) return NextResponse.json({ code: 'origin_required' }, { status: 403 });

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return NextResponse.json({ code: 'origin_invalid' }, { status: 403 });
  }

  const requestUrl = new URL(request.url);
  const configuredOrigin = process.env.PUBLIC_APP_ORIGIN;
  if (configuredOrigin) {
    try {
      if (new URL(configuredOrigin).origin !== configuredOrigin) {
        return NextResponse.json({ code: 'origin_configuration_invalid' }, { status: 500 });
      }
    } catch {
      return NextResponse.json({ code: 'origin_configuration_invalid' }, { status: 500 });
    }
  }

  const expectedOrigins = new Set([configuredOrigin ?? requestUrl.origin]);
  if (configuredOrigin) {
    return expectedOrigins.has(originUrl.origin)
      ? undefined
      : NextResponse.json({ code: 'origin_invalid' }, { status: 403 });
  }

  const host = request.headers.get('host');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = forwardedProto ?? requestUrl.protocol.slice(0, -1);
  if (host) {
    expectedOrigins.add(`${protocol}://${host}`);
    expectedOrigins.add(`https://${host}`);
  }
  if (forwardedHost) {
    expectedOrigins.add(`${protocol}://${forwardedHost}`);
    expectedOrigins.add(`https://${forwardedHost}`);
  }

  return expectedOrigins.has(originUrl.origin)
    ? undefined
    : NextResponse.json({ code: 'origin_invalid' }, { status: 403 });
}
