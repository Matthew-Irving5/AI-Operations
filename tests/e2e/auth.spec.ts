import { expect, test } from '@playwright/test';

test('login is the only unauthenticated entry point', async ({ page }) => {
  await page.goto('/overview');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'AI Operations' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByText('Multi-factor authentication is required.')).toBeVisible();
});

test('login remains usable at iPhone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('direct sign-in API navigation returns to the login page', async ({ page }) => {
  await page.goto('/api/auth/sign-in');
  await expect(page).toHaveURL(/\/login$/);
});

test('MFA challenge is available before protected navigation', async ({ page }) => {
  await page.goto('/mfa');
  await expect(page.getByRole('heading', { name: 'Verify your identity' })).toBeVisible();
  await expect(page.getByLabel('Six-digit code')).toHaveAttribute('inputmode', 'numeric');
  await expect(page.getByRole('button', { name: 'Verify' })).toBeDisabled();
});
