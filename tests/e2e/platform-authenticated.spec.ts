import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signInLocalTestUser } from './local-auth';

test.beforeEach(async ({ page, baseURL }) => signInLocalTestUser(page, baseURL));

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
  await expect(
    page.getByRole('heading', { name: 'No personal Google data account is connected.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'No AI Operations mailbox is connected.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Apple Shortcut bridge', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('No Apple Shortcut bridge device is registered.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect personal Google data' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.evaluate(() => document.documentElement.scrollWidth),
  ).resolves.toBeLessThanOrEqual(390);
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
  await expect(page.getByText('No registered device yet.')).toBeVisible();
  await page.goto('/settings');
  await expect(
    page.getByRole('heading', { name: 'Settings & production onboarding' }),
  ).toBeVisible();
  await expect(page.getByText('0/17 required setup steps recorded')).toBeVisible();
  const supabaseInstructions = page.getByText('Production Supabase secrets');
  await expect(supabaseInstructions).toBeVisible();
  await supabaseInstructions.click();
  await expect(page.getByText(/PRODUCTION_SUPABASE_ACCESS_TOKEN/)).toBeVisible();
  const sourcePermissionInstructions = page.getByText('Source app permissions');
  await sourcePermissionInstructions.click();
  await expect(page.getByText(/empty saved selection means ingest none/i)).toBeVisible();
  await expect(page.getByText(/without selection controls/i)).toHaveCount(0);
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
