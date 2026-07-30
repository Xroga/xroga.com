import { expect, test } from '@playwright/test';

// Each test gets a fresh, isolated browser context with empty storage by
// default — no explicit localStorage reset needed (and page.addInitScript
// would re-run on every navigation, including page.reload(), wiping any
// dismissal the test just made).

test('homepage announcement banner renders above the header with exact copy and no layout overlap', async ({ page }) => {
  await page.goto('/');

  const banner = page.getByTestId('homepage-announcement');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Early Access');
  await expect(banner).toContainText('Xroga is in active testing. Build and test for free through August 30, 2026.');

  // Banner must not overlap the header/nav — its bottom edge should sit at or above the header's top edge.
  const bannerBox = await banner.boundingBox();
  const header = page.locator('header').first();
  const headerBox = await header.boundingBox();
  expect(bannerBox).not.toBeNull();
  expect(headerBox).not.toBeNull();
  if (bannerBox && headerBox) {
    expect(bannerBox.y + bannerBox.height).toBeLessThanOrEqual(headerBox.y + 1);
  }

  await expect(banner.getByRole('link', { name: /Start building|Open Workspace/ })).toBeVisible();
});

test('dismissing the announcement banner persists across reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('homepage-announcement')).toBeVisible();

  await page.getByRole('button', { name: 'Dismiss announcement' }).click();
  await expect(page.getByTestId('homepage-announcement')).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('homepage-announcement')).toHaveCount(0);
});

test('homepage announcement banner is usable at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByTestId('homepage-announcement')).toBeVisible();
  await expect(page.getByTestId('homepage-announcement').getByRole('link', { name: /Start building|Open Workspace/ })).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
