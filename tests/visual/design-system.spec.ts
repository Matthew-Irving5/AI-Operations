import { expect, test } from '@playwright/test';

for (const viewport of [
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1728x1117', width: 1728, height: 1117 },
]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`${viewport.name} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      await page.evaluate((selectedTheme) => {
        document.documentElement.dataset.theme = selectedTheme;
      }, theme);
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`${viewport.name}-${theme}.png`, {
        fullPage: true,
        animations: 'disabled',
      });
    });
  }
}

test('keyboard focus and reduced motion stay visible and still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.keyboard.press('Tab');

  const focused = await page.evaluate(() => {
    const active = document.activeElement;
    return active instanceof HTMLElement
      ? {
          outlineStyle: getComputedStyle(active).outlineStyle,
          outlineWidth: getComputedStyle(active).outlineWidth,
        }
      : null;
  });
  expect(focused?.outlineStyle).toBe('solid');
  expect(focused?.outlineWidth).toBe('2px');
  await expect(page.locator('.ui-spinner')).toHaveCSS('animation-name', 'none');
});

test('restores a saved theme before the page paints', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ai-operations-theme', 'dark'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
