import { expect, test } from '@playwright/test';
import { signInLocalTestUser } from './local-auth';

const seededReportId = '00000000-0000-4000-8000-000000000505';

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
    expect(firstAuthCookie).toMatchObject({
      httpOnly: true,
      sameSite: 'Lax',
      secure: false,
    });
    expect(secondAuthCookie).toMatchObject({
      httpOnly: true,
      sameSite: 'Lax',
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
