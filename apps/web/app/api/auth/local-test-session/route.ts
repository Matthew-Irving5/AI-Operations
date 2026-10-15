import { createPrivateKey, sign, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAllowedEmail } from '../../../../lib/auth';
import {
  assertLocalTestAuthEnvironment,
  localAuthFailureDiagnostic,
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

// Only the isolated loopback fixture may elevate this real GoTrue session.
// Production MFA routes are unchanged.
function signLocalAal2Token(jwksJson: string, accessToken: string): string {
  const [header, payload] = accessToken.split('.');
  if (!header || !payload) throw new Error('Local Auth returned an invalid access token.');
  const tokenHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as {
    alg?: string;
    kid?: string;
  };
  if (tokenHeader.alg !== 'ES256' || !tokenHeader.kid) {
    throw new Error('Local Auth returned an unsupported signing key.');
  }
  const keys = z
    .array(z.object({ kty: z.literal('EC'), kid: z.string(), d: z.string() }).passthrough())
    .parse(JSON.parse(jwksJson));
  const key = keys.find((candidate) => candidate.kid === tokenHeader.kid);
  if (!key) throw new Error('Local Auth signing key is unavailable.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
  claims.aal = 'aal2';
  const encodedPayload = base64Url(JSON.stringify(claims));
  const input = `${header}.${encodedPayload}`;
  const signature = sign('sha256', Buffer.from(input), {
    key: createPrivateKey({ key, format: 'jwk' }),
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `${input}.${signature}`;
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
  const authResponse = await fetch(`${localUrl.origin}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(5_000),
  }).catch(() => null);
  if (!authResponse?.ok) {
    const authBody = await authResponse?.json().catch(() => null);
    return NextResponse.json(
      {
        code: 'local_auth_rejected',
        ...localAuthFailureDiagnostic(authResponse?.status ?? 0, authBody),
      },
      { status: 401 },
    );
  }
  const sessionSchema = z
    .object({
      access_token: z.string().min(1),
      expires_at: z.number().optional(),
      expires_in: z.number().optional(),
      refresh_token: z.string().min(1),
      token_type: z.string(),
      user: z.object({ id: z.string(), aud: z.string(), email: z.string().email() }).passthrough(),
    })
    .passthrough();
  const parsedSession = sessionSchema.safeParse(await authResponse.json().catch(() => null));
  if (!parsedSession.success || parsedSession.data.user.id !== localTestUserId) {
    return NextResponse.json({ code: 'local_auth_rejected' }, { status: 401 });
  }
  const session = {
    ...parsedSession.data,
    access_token: signLocalAal2Token(
      process.env.LOCAL_TEST_AUTH_SIGNING_KEYS ?? '',
      parsedSession.data.access_token,
    ),
  };
  const cookieName = `sb-${localUrl.hostname.split('.')[0]}-auth-token`;
  const expiresAt =
    session.expires_at ?? Math.floor(Date.now() / 1000) + (session.expires_in ?? 900);
  const encodedSession = `base64-${base64Url(JSON.stringify(session))}`;
  const cookieStore = await cookies();
  cookieStore.set(cookieName, encodedSession, {
    expires: new Date(expiresAt * 1000),
    httpOnly: true,
    maxAge: 900,
    path: '/',
    sameSite: 'lax',
    secure: false,
  });
  return NextResponse.json({ authenticated: true }, { headers: { 'cache-control': 'no-store' } });
}
