import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';

const userId = '00000000-0000-0000-0000-000000000101';
const email = 'matthewirving99@gmail.com';

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function signedAccessToken(): string {
  const secret = process.env.E2E_JWT_SECRET;
  if (!secret) throw new Error('E2E_JWT_SECRET must be provided by the local Supabase test stack.');
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
      sub: userId,
    }),
  );
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

test.beforeEach(async ({ context }) => {
  const accessToken = signedAccessToken();
  const expiresAt = Math.floor(Date.now() / 1000) + 900;
  const session = {
    access_token: accessToken,
    expires_at: expiresAt,
    expires_in: 900,
    refresh_token: 'synthetic-local-e2e-session',
    token_type: 'bearer',
    user: { id: userId, aud: 'authenticated', email, role: 'authenticated' },
  };
  await context.addCookies([
    {
      name: 'sb-127-auth-token',
      value: `base64-${base64Url(JSON.stringify(session))}`,
      url: 'http://127.0.0.1:3000',
      sameSite: 'Lax',
    },
  ]);
});

test('authenticated Operations, spend, trace, approval, and feedback surfaces render platform evidence', async ({
  page,
}) => {
  await page.goto('/operations');
  await expect(page.getByRole('heading', { name: 'Operations Centre' })).toBeVisible();
  await expect(page.getByText('Synthetic platform health')).toHaveCount(0);

  await page.goto('/spend-forecasting');
  await expect(page.getByRole('heading', { name: 'AI Spend & Forecasting' })).toBeVisible();
  const chartPeriod = page.getByLabel('Spend chart period');
  await expect(chartPeriod).toBeVisible();
  await expect(page.getByRole('button', { name: '7 days' })).toBeVisible();
  await expect(page.getByText(/Actual \$0\.00/)).toBeVisible();

  await page.goto('/ai-traces-audit');
  await expect(page.getByRole('heading', { name: 'AI Traces & Audit' })).toBeVisible();
  await expect(page.getByText('workflow.completed')).toBeVisible();
  await expect(page.getByText(/Correlation:/)).toBeVisible();

  await page.goto('/approvals');
  await expect(page.getByRole('heading', { name: 'Approvals' })).toBeVisible();
  await expect(page.getByText('Review synthetic platform action')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();

  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
  expect(await page.locator('script[src]').count()).toBeGreaterThan(0);
  await expect(page.getByText('Synthetic platform health')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit feedback' })).toBeDisabled();
});

test('authenticated platform navigation remains usable at iPhone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/operations');
  await expect(page.getByRole('heading', { name: 'Operations Centre' })).toBeVisible();
  await expect(
    page.evaluate(() => document.documentElement.scrollWidth),
  ).resolves.toBeLessThanOrEqual(390);
});
