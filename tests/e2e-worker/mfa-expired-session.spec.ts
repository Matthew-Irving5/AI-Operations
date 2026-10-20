import { createHmac, createPrivateKey, sign } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { z } from 'zod';

test.use({ trace: 'off' });

const enrollmentSchema = z.object({
  factorId: z.string().uuid(),
  secret: z.string().min(16),
});

const signingKeysSchema = z.array(
  z.object({ alg: z.string(), kid: z.string(), d: z.string() }).passthrough(),
);

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function decodeBase32(secret: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of secret.toUpperCase().replace(/=+$/u, '')) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error('Local Supabase returned an invalid TOTP secret.');
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
      value &= (1 << bits) - 1;
    }
  }
  if (bits > 0) bytes.push((value << (8 - bits)) & 0xff);
  return Buffer.from(bytes);
}

function currentTotp(secret: string): string {
  const counter = BigInt(Math.floor(Date.now() / 30_000));
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(counter);
  const digest = createHmac('sha1', decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const number = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return number.toString().padStart(6, '0');
}

function expireAccessToken(token: string): string {
  const [headerPart, payloadPart] = token.split('.');
  if (!headerPart || !payloadPart)
    throw new Error('Local Supabase returned an invalid access token.');
  const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8')) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
  const keys = signingKeysSchema.parse(
    JSON.parse(process.env.LOCAL_TEST_AUTH_SIGNING_KEYS ?? '[]'),
  );
  const key = keys.find(
    (candidate) => candidate.kid === header.kid && candidate.alg === header.alg,
  );
  if (header.alg !== 'ES256' || !key)
    throw new Error('The isolated local Auth signing key did not match its session token.');
  const now = Math.floor(Date.now() / 1000);
  payload.iat = now - 3_600;
  payload.exp = now - 60;
  const input = `${headerPart}.${base64Url(JSON.stringify(payload))}`;
  const signature = sign('sha256', Buffer.from(input), {
    key: createPrivateKey({ key, format: 'jwk' }),
    dsaEncoding: 'ieee-p1363',
  });
  return `${input}.${base64Url(signature)}`;
}

test('verified-factor MFA page refreshes an expired access token in the Worker runtime', async ({
  page,
  baseURL,
}) => {
  const email = process.env.LOCAL_TEST_EMAIL;
  const password = process.env.LOCAL_TEST_PASSWORD;
  if (!email || !password || !baseURL)
    throw new Error('The isolated local QA runner did not configure local test credentials.');

  const origin = new URL(baseURL).origin;
  const signedIn = await page.request.post('/api/auth/sign-in', {
    headers: { origin },
    form: { email, password },
    maxRedirects: 0,
  });
  expect(signedIn.status()).toBe(303);

  const enrolled = await page.request.post('/api/auth/mfa/enroll', {
    headers: { origin },
  });
  expect(enrolled.status()).toBe(200);
  const enrollment = enrollmentSchema.safeParse(await enrolled.json());
  expect(enrollment.success).toBe(true);
  if (!enrollment.success) throw new Error('Local Auth did not return an MFA factor fixture.');

  const factorId = enrollment.data.factorId;
  const secret = enrollment.data.secret;
  const waitForStableTotpWindow = async () => {
    while (30_000 - (Date.now() % 30_000) < 5_000) await page.waitForTimeout(100);
  };
  await waitForStableTotpWindow();
  const verified = await page.request.post('/api/auth/mfa/verify', {
    headers: { origin },
    data: { factorId, code: currentTotp(secret) },
  });
  expect(verified.status()).toBe(200);

  const signedOut = await page.request.post('/api/auth/sign-out', { headers: { origin } });
  expect(signedOut.status()).toBe(200);
  const signedInAgain = await page.request.post('/api/auth/sign-in', {
    headers: { origin },
    form: { email, password },
    maxRedirects: 0,
  });
  expect(signedInAgain.status()).toBe(303);

  const authCookies = await page.context().cookies(baseURL);
  const authCookie = authCookies.find((cookie) => cookie.name.endsWith('-auth-token'));
  expect(authCookie).toBeDefined();
  if (!authCookie) throw new Error('Local sign-in did not persist an Auth session cookie.');
  const encodedSession = authCookie.value.startsWith('base64-')
    ? authCookie.value.slice('base64-'.length)
    : authCookie.value;
  const session = JSON.parse(Buffer.from(encodedSession, 'base64url').toString('utf8')) as {
    access_token?: string;
    refresh_token?: string;
    [key: string]: unknown;
  };
  if (!session.access_token || !session.refresh_token)
    throw new Error('Local Auth session did not include refreshable tokens.');
  const now = Math.floor(Date.now() / 1000);
  const expiredSession = {
    ...session,
    access_token: expireAccessToken(session.access_token),
    expires_at: now - 60,
    expires_in: 0,
  };
  await page.context().addCookies([
    {
      ...authCookie,
      value: `base64-${base64Url(JSON.stringify(expiredSession))}`,
    },
  ]);

  const response = await page.goto('/mfa?job=schedule_update&returnTo=%2Foverview');
  expect(response?.status()).toBe(200);
  const refreshedCookie = (await page.context().cookies(baseURL)).find((cookie) =>
    cookie.name.endsWith('-auth-token'),
  );
  expect(refreshedCookie).toBeDefined();
  if (!refreshedCookie)
    throw new Error('The Worker response did not persist the refreshed session.');
  const refreshedValue = refreshedCookie.value.startsWith('base64-')
    ? refreshedCookie.value.slice('base64-'.length)
    : refreshedCookie.value;
  const refreshedSession = JSON.parse(
    Buffer.from(refreshedValue, 'base64url').toString('utf8'),
  ) as {
    access_token?: string;
    expires_at?: number;
  };
  expect(refreshedSession.access_token === expiredSession.access_token).toBe(false);
  expect(typeof refreshedSession.expires_at === 'number' && refreshedSession.expires_at > now).toBe(
    true,
  );
  await expect(page.getByRole('heading', { name: 'Verify your identity' })).toBeVisible();
  await expect(page.getByLabel('Authenticator factor')).toHaveValue(factorId);
  await expect(page.getByLabel('Six-digit code')).toBeVisible();
  await expect(page.getByText('Preparing secure authenticator enrolment')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Verify' })).toBeEnabled();
});
