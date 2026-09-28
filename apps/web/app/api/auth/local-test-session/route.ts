import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAllowedEmail } from '../../../../lib/auth';
import {
  assertLocalTestAuthEnvironment,
  localTestUserId,
  validateStagingAuthCredentials,
} from '../../../../lib/local-test-auth';
import { requireSameOrigin } from '../../../../lib/request-security';

const credentialsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(1024),
});

function constantTimeMatch(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function signLocalAccessToken(secret: string, email: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({
      aal: 'aal2',
      aud: 'authenticated',
      email,
      exp: now + 900,
      iat: now,
      iss: 'supabase-demo',
      role: 'authenticated',
      sub: localTestUserId,
    }),
  );
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

export async function POST(request: Request): Promise<NextResponse> {
  let enabled: boolean;
  try {
    enabled = assertLocalTestAuthEnvironment(process.env);
  } catch {
    return NextResponse.json({ code: 'local_test_auth_unavailable' }, { status: 404 });
  }
  if (!enabled) return NextResponse.json({ code: 'not_found' }, { status: 404 });

  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const appOrigin = process.env.LOCAL_TEST_APP_ORIGIN;
  const configuredOrigin = appOrigin ? new URL(appOrigin) : undefined;
  const originHeader = request.headers.get('origin');
  let originMatches = false;
  try {
    originMatches = Boolean(
      configuredOrigin && originHeader && new URL(originHeader).origin === configuredOrigin.origin,
    );
  } catch {
    originMatches = false;
  }
  const trustedHosts = [
    request.headers.get('host'),
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim(),
  ];
  const hostMatches = Boolean(
    configuredOrigin &&
      trustedHosts.some((host) => host?.toLowerCase() === configuredOrigin.host.toLowerCase()),
  );
  const isLoopbackHost = Boolean(
    configuredOrigin && ['127.0.0.1', 'localhost', '[::1]'].includes(configuredOrigin.hostname),
  );
  if (!configuredOrigin || !originMatches || !hostMatches || !isLoopbackHost) {
    return NextResponse.json(
      { code: 'local_origin_required', originMatches, hostMatches, isLoopbackHost },
      { status: 403 },
    );
  }

  const parsed = credentialsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: 'invalid_credentials' }, { status: 401 });
  const { email, password } = parsed.data;
  if (
    !isAllowedEmail(email) ||
    email.toLowerCase() !== process.env.LOCAL_TEST_EMAIL?.toLowerCase() ||
    !constantTimeMatch(password, process.env.LOCAL_TEST_PASSWORD ?? '')
  ) {
    return NextResponse.json({ code: 'invalid_credentials' }, { status: 401 });
  }

  if (process.env.LOCAL_TEST_AUTH_VALIDATE_STAGING) {
    const valid = await validateStagingAuthCredentials(
      process.env.LOCAL_TEST_STAGING_EMAIL ?? '',
      process.env.LOCAL_TEST_STAGING_PASSWORD ?? '',
      process.env.LOCAL_TEST_STAGING_ANON_KEY ?? '',
    );
    if (!valid) return NextResponse.json({ code: 'invalid_credentials' }, { status: 401 });
  }

  const localUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
  const cookieName = `sb-${localUrl.hostname.split('.')[0]}-auth-token`;
  const expiresAt = Math.floor(Date.now() / 1000) + 900;
  const session = {
    access_token: signLocalAccessToken(process.env.E2E_JWT_SECRET ?? '', email),
    expires_at: expiresAt,
    expires_in: 900,
    refresh_token: 'local-test-session',
    token_type: 'bearer',
    user: { id: localTestUserId, aud: 'authenticated', email, role: 'authenticated' },
  };
  const encodedSession = `base64-${base64Url(JSON.stringify(session))}`;
  const cookieStore = await cookies();
  cookieStore.set(cookieName, encodedSession, {
    expires: new Date(expiresAt * 1000),
    httpOnly: false,
    maxAge: 900,
    path: '/',
    sameSite: 'lax',
    secure: false,
  });
  return NextResponse.json({ authenticated: true }, { headers: { 'cache-control': 'no-store' } });
}
