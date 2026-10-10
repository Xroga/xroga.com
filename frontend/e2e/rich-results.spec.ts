import { expect, test } from '@playwright/test';

test('gallery renders actual chat output with sample label and working controls', async ({ page }) => {
  const forbidden: string[] = [];
  page.on('request', (request) => { if (/\/api\/(admin\/errors|operations\/readiness|swarm\/execute)/.test(request.url())) forbidden.push(request.url()); });
  const response = await page.goto('/os-preview/rich-results');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Answers worth exploring.' })).toBeVisible();
  await expect(page.getByText(/Demo experience — no real work or external changes/).first()).toBeVisible();
  await expect(page.getByTestId('rich-result-card')).toHaveCount(33);
  await page.locator('section[aria-label="Rich answer controls"] > div select').first().selectOption('transport');
  await expect(page.getByTestId('rich-result-card')).toHaveCount(6);
  await page.getByLabel('Presentation').selectOption('ticket');
  await page.getByLabel('Images missing').check();
  await page.getByLabel('Partial output').check();
  await expect(page.getByText('Partial output — some details may still be missing.')).toBeVisible();
  await page.getByLabel('Unavailable result').check();
  await expect(page.getByTestId('rich-result-card').first().getByText('Demo · Unavailable')).toBeVisible();
  await expect(page.getByTestId('rich-result-card').first().getByRole('link', { name: /View source/ })).toHaveCount(0);
  expect(forbidden).toEqual([]);
});

test('narrow viewport, dark surface, comparison and keyboard actions work', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/os-preview/rich-results');
  await page.getByLabel('Viewport').selectOption('mobile');
  await page.getByLabel('Theme').selectOption('dark');
  await page.getByLabel('Two-item comparison').check();
  await expect(page.getByRole('region', { name: 'Selected result comparison' })).toBeVisible();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Tab');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('image-free and reduced-motion cards retain readable coupon details', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/os-preview/rich-results');
  await page.locator('section[aria-label="Rich answer controls"] > div select').first().selectOption('shopping');
  await page.getByLabel('Images missing').check();
  const coupon = page.getByTestId('rich-result-card').filter({ hasText: 'Sample welcome discount' });
  await coupon.getByText('Details').click();
  await expect(coupon.getByText('DEMO-WELCOME')).toBeVisible();
  await expect(coupon.getByText('Demo only; cannot be redeemed')).toBeVisible();
  await page.getByLabel('Theme').selectOption('light');
  await expect(page.getByTestId('rich-result-card')).toHaveCount(6);
});
