import { expect, type Page } from '@playwright/test';

export async function signInLocalTestUser(page: Page, baseURL: string | undefined): Promise<void> {
  const email = process.env.LOCAL_TEST_EMAIL;
  const password = process.env.LOCAL_TEST_PASSWORD;
  if (!email || !password || !baseURL)
    throw new Error('The local QA runner did not provide local test credentials and app origin.');
  const response = await page.request.post('/api/auth/local-test-session', {
    headers: { origin: baseURL },
    data: { email, password },
  });
  const body = await response.json().catch(() => null);
  expect(
    response.status(),
    `Local test sign-in rejected: ${JSON.stringify(body ?? { code: 'no error code' })}`,
  ).toBe(200);
}
