import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 } });

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
    throw new Error('Composer UI verification requires an isolated local preview.');
  }
  await page.route('https://*.supabase.co/**', route => route.abort());
});

test('New Work composer is a single surface and model and voice actions remain usable', async ({ page }) => {
  await page.goto('/workspace');
  const frame = page.locator('.xv-terminal-dock--idle .xv-kimi-composer-frame');
  await expect(frame).toBeVisible();
  await expect.poll(async () => frame.evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('0px');
  await expect(page.locator('.xv-chatbar-solid')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Automatic model and tool routing' })).toBeVisible();
  await page.getByRole('button', { name: 'Automatic model and tool routing' }).click();
  await expect(page.getByTestId('black-hole-model-panel')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start voice typing' })).toBeVisible();
  await expect(page.locator('.xv-voice-icon-only svg path')).toHaveCount(6);
  await page.screenshot({ path: 'test-results/composer-single-surface.png' });
});

test('hover reveals starter detail; Back works, and choosing fills but never sends a complete instruction', async ({ page }) => {
  await page.goto('/workspace');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Find features' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Web research' }).hover();
  await expect(menu.getByRole('region', { name: 'Web research action' })).toBeVisible();
  await menu.getByRole('button', { name: 'Back to categories' }).click();
  await expect(menu.getByRole('region', { name: 'Web research action' })).toHaveCount(0);
  await menu.getByRole('menuitem', { name: 'Web research' }).hover();
  await menu.getByRole('button', { name: /Use this in chat/ }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.locator('[data-terminal-composer]')).toHaveValue(/My goal: Research this topic/);
  await expect(page.locator('[data-terminal-composer]')).toHaveValue(/Ask for approval before publishing/);
  await expect(page.getByRole('navigation', { name: 'Conversation turn navigation' })).toHaveCount(0);
});

test('feature popovers stay within the viewport on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.goto('/workspace');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const popup = page.getByRole('menu', { name: 'Create features' });
  await expect(popup).toBeVisible();
  const box = await popup.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(720);
  await popup.getByRole('menuitem', { name: 'Documents' }).hover();
  await expect(popup.getByRole('region', { name: 'Documents action' })).toBeVisible();
  await page.screenshot({ path: 'test-results/composer-mobile-popover.png' });
});
