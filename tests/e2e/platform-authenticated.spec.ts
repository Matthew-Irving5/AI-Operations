import { createHmac } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
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
  await page.goto('/overview');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByText('Synthetic platform health')).toBeVisible();
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

test('Personal Operations and connection empty states remain available to an AAL2 user', async ({
  page,
}) => {
  await page.goto('/personal');
  await expect(page.getByRole('heading', { name: 'Personal Operations' })).toBeVisible();
  await expect(page.getByText('No open reminders have been imported.')).toBeVisible();
  await page.goto('/data-sources');
  await expect(page.getByRole('heading', { name: 'Data Sources' })).toBeVisible();
  await expect(page.getByText('No Google account is connected.')).toBeVisible();
});

test('Health and Finance AAL2 surfaces make safe empty states explicit', async ({ page }) => {
  await page.goto('/health');
  await expect(page.getByRole('heading', { name: 'Health & Performance' })).toBeVisible();
  await expect(page.getByText('No Health export has been processed.')).toBeVisible();
  await page.goto('/finance');
  await expect(page.getByRole('heading', { name: 'Finance Operations' })).toBeVisible();
  await expect(page.getByText('No close has been prepared.')).toBeVisible();
});

test('Career, Travel, and Procurement surfaces expose bounded empty states at desktop and mobile widths', async ({
  page,
}) => {
  await page.goto('/career');
  await expect(page.getByRole('heading', { name: 'Career Operations' })).toBeVisible();
  await expect(page.getByText('No personal repository evidence is retained yet.')).toBeVisible();
  await page.goto('/travel');
  await expect(page.getByRole('heading', { name: 'Travel Planning' })).toBeVisible();
  await expect(page.getByText('No plan has been launched.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Queue research' })).toBeVisible();
  await page.goto('/procurement');
  await expect(page.getByRole('heading', { name: 'Consumer & Procurement' })).toBeVisible();
  await expect(page.getByText('No research request has been launched.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Queue research' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.evaluate(() => document.documentElement.scrollWidth),
  ).resolves.toBeLessThanOrEqual(390);
});

test('Digital Estate shows its safe paired-worker empty state', async ({ page }) => {
  await page.goto('/digital-estate');
  await expect(page.getByRole('heading', { name: 'Digital Estate' })).toBeVisible();
  await expect(page.getByText('No worker is paired.')).toBeVisible();
  await expect(page.getByText('No scan has been requested.')).toBeVisible();
});

test('Systems, device, and onboarding surfaces are reachable and preserve production gates', async ({
  page,
}) => {
  await page.goto('/systems-automation');
  await expect(page.getByRole('heading', { name: 'Systems & Automation' })).toBeVisible();
  await expect(page.getByText('Approval-gated')).toBeVisible();
  await page.goto('/devices');
  await expect(page.getByRole('heading', { name: 'Devices' })).toBeVisible();
  await expect(page.getByText('No registered device. Register a Windows worker')).toBeVisible();
  await page.goto('/settings');
  await expect(
    page.getByRole('heading', { name: 'Settings & production onboarding' }),
  ).toBeVisible();
  await expect(page.getByText('0/17 required setup steps recorded')).toBeVisible();
  const supabaseInstructions = page.getByText('Production Supabase secrets');
  await expect(supabaseInstructions).toBeVisible();
  await supabaseInstructions.click();
  await expect(page.getByText(/PRODUCTION_SUPABASE_ACCESS_TOKEN/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Record final production acceptance' }),
  ).toBeDisabled();
});

test('authenticated control surfaces have no critical accessibility violations', async ({
  page,
}) => {
  test.setTimeout(60_000);
  for (const path of ['/overview', '/settings']) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((violation) =>
        ['critical', 'serious'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
  }
});
