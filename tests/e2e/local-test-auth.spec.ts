import { expect, test } from '@playwright/test';
import { signInLocalTestUser } from './local-auth';

// These tests exercise credential-bearing requests; retain safe assertions, not request traces.
test.use({ trace: 'off' });

const seededReportId = '00000000-0000-4000-8000-000000000505';

test('server password sign-in route redirects to MFA using local Supabase', async ({
  request,
  baseURL,
}) => {
  const email = process.env.LOCAL_TEST_EMAIL;
  const password = process.env.LOCAL_TEST_PASSWORD;
  if (!email || !password || !baseURL)
    throw new Error('The local QA runner did not configure test credentials and app origin.');

  const startedAt = Date.now();
  let response;
  try {
    response = await request.post(new URL('/api/auth/sign-in', baseURL).toString(), {
      headers: { origin: baseURL },
      form: { email, password },
      maxRedirects: 0,
      timeout: 12_000,
    });
  } catch {
    throw new Error(
      `App password sign-in route produced no response in ${Date.now() - startedAt}ms.`,
    );
  }

  const location = response.headers().location ?? 'none';
  const redirectUrl = new URL(location, baseURL);
  expect(
    response.status(),
    `App password sign-in route returned HTTP ${response.status()} in ${Date.now() - startedAt}ms; redirect=${redirectUrl.origin}${redirectUrl.pathname}`,
  ).toBe(303);
  expect(redirectUrl.origin).toBe(new URL(baseURL).origin);
  expect(redirectUrl.pathname).toBe('/mfa');
});

test('real password sign-in reaches the MFA challenge', async ({ page, baseURL }) => {
  test.setTimeout(45_000);
  const email = process.env.LOCAL_TEST_EMAIL;
  const password = process.env.LOCAL_TEST_PASSWORD;
  if (!email || !password || !baseURL)
    throw new Error('The local QA runner did not configure test credentials and app origin.');

  await page.goto('/login');

  const startedAt = Date.now();
  const requestEvents: string[] = [];
  const authFlowPath = (request: import('@playwright/test').Request) => {
    const pathname = new URL(request.url()).pathname;
    return pathname === '/api/auth/sign-in' || pathname === '/mfa' ? pathname : undefined;
  };
  page.on('request', (request) => {
    const pathname = authFlowPath(request);
    if (pathname)
      requestEvents.push(
        `${request.method()} ${pathname} started at ${new URL(request.url()).origin}`,
      );
  });
  page.on('response', (response) => {
    const pathname = authFlowPath(response.request());
    if (pathname)
      requestEvents.push(
        `${response.request().method()} ${pathname} HTTP ${response.status()} location=${response.headers().location ?? 'none'}`,
      );
  });
  page.on('requestfinished', (request) => {
    const pathname = authFlowPath(request);
    if (pathname) requestEvents.push(`${request.method()} ${pathname} finished`);
  });
  page.on('requestfailed', (request) => {
    const pathname = authFlowPath(request);
    if (pathname)
      requestEvents.push(
        `${request.method()} ${pathname} failed=${request.failure()?.errorText ?? 'unknown'} at ${new URL(request.url()).origin}`,
      );
  });

  try {
    await page.getByRole('textbox', { name: 'Email' }).fill(email);
    await page.getByLabel('Password').fill(password);

    const mfaUrlPromise = page.waitForURL(
      (url) => url.pathname === '/mfa' && url.origin === new URL(baseURL).origin,
      { timeout: 15_000 },
    );
    const mfaResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && new URL(response.url()).pathname === '/mfa',
      { timeout: 15_000 },
    );
    await page.getByRole('button', { name: 'Sign in' }).click();
    await mfaUrlPromise;
    const mfaResponse = await mfaResponsePromise;
    expect(mfaResponse.status(), `GET /mfa completed in ${Date.now() - startedAt}ms.`).toBe(200);
    expect(new URL(page.url()).origin).toBe(new URL(baseURL).origin);
    await expect(page.locator('main')).toContainText(/multi-factor|authenticator|verification/i);
  } catch (error) {
    if (new URL(page.url()).pathname === '/login') {
      await page
        .locator('input[name="password"]')
        .fill('', { timeout: 1_000 })
        .catch(() => undefined);
      await page
        .locator('input[name="email"]')
        .fill('', { timeout: 1_000 })
        .catch(() => undefined);
    }
    const details = error instanceof Error ? error.message : 'unknown test failure';
    throw new Error(
      `Local password form sign-in failed after ${Date.now() - startedAt}ms; currentPath=${new URL(page.url()).pathname}; requestEvents=${requestEvents.join(',') || 'none'}; origin=${baseURL ?? 'unknown'}; cause=${details}`,
    );
  }
});

test('local test credentials reject invalid sign-in and allow a protected DB journey', async ({
  page,
  baseURL,
}) => {
  const email = process.env.LOCAL_TEST_EMAIL;
  const password = process.env.LOCAL_TEST_PASSWORD;
  if (!email || !password)
    throw new Error('The local QA runner did not configure test credentials.');

  const rejected = await page.request.post('/api/auth/local-test-session', {
    headers: { origin: baseURL ?? '' },
    data: { email, password: `${password}x` },
  });
  expect(rejected.status()).toBe(401);
  expect(await rejected.json()).toEqual({ code: 'invalid_credentials' });
  expect(rejected.headers()['set-cookie']).toBeUndefined();

  const crossOrigin = await page.request.post('/api/auth/local-test-session', {
    headers: { origin: 'https://ai-operations-staging.ai-operations.workers.dev' },
    data: { email, password },
  });
  expect(crossOrigin.status()).toBe(403);

  await signInLocalTestUser(page, baseURL);
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Synthetic platform health' })).toBeVisible();

  const denied = await page.request.post('/api/feedback', {
    headers: { origin: baseURL ?? '' },
    data: {
      reportId: '00000000-0000-4000-8000-000000000999',
      positive: true,
      categories: [],
    },
  });
  expect(denied.status()).toBe(404);
  expect(await denied.json()).toEqual({ code: 'report_not_found' });

  const accepted = await page.request.post('/api/feedback', {
    headers: { origin: baseURL ?? '' },
    data: {
      reportId: seededReportId,
      positive: true,
      categories: ['usefulness'],
      comment: 'Local fixture acceptance.',
    },
  });
  const acceptedBody = await accepted.json();
  expect(accepted.status(), `feedback-submit failed: ${JSON.stringify(acceptedBody)}`).toBe(201);
  expect(acceptedBody).toMatchObject({ feedbackId: expect.any(String) });

  await page.goto('/ai-traces-audit');
  await expect(page.getByRole('heading', { name: 'feedback_submitted' }).first()).toBeVisible();
});

test('parallel local sessions receive independent protected browser sessions', async ({
  browser,
  baseURL,
}) => {
  const firstContext = await browser.newContext({ baseURL });
  const secondContext = await browser.newContext({ baseURL });
  try {
    const [firstPage, secondPage] = await Promise.all([
      firstContext.newPage(),
      secondContext.newPage(),
    ]);
    await Promise.all([
      signInLocalTestUser(firstPage, baseURL),
      signInLocalTestUser(secondPage, baseURL),
    ]);
    const [firstCookies, secondCookies] = await Promise.all([
      firstContext.cookies(),
      secondContext.cookies(),
    ]);
    const firstAuthCookie = firstCookies.find((cookie) => cookie.name.endsWith('-auth-token'));
    const secondAuthCookie = secondCookies.find((cookie) => cookie.name.endsWith('-auth-token'));
    expect(firstAuthCookie).toBeDefined();
    expect(secondAuthCookie).toBeDefined();
    // WebKit's cookie inventory reports SameSite=None for a response whose
    // Set-Cookie header is SameSite=Lax. local-auth.ts checks the wire policy;
    // this browser assertion checks the stored HttpOnly, non-Secure session.
    expect(firstAuthCookie).toMatchObject({
      httpOnly: true,
      secure: false,
    });
    expect(secondAuthCookie).toMatchObject({
      httpOnly: true,
      secure: false,
    });
    expect(firstAuthCookie?.value).not.toBe(secondAuthCookie?.value);
    await Promise.all([firstPage.goto('/reports'), secondPage.goto('/reports')]);
    await Promise.all([
      expect(firstPage.getByRole('heading', { name: 'Reports' })).toBeVisible(),
      expect(secondPage.getByRole('heading', { name: 'Reports' })).toBeVisible(),
    ]);
  } finally {
    await Promise.all([firstContext.close(), secondContext.close()]);
  }
});
