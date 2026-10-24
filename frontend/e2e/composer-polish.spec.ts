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
  await expect(page.getByRole('button', { name: 'Black Hole model and usage' })).toBeVisible();
  await page.getByRole('button', { name: 'Black Hole model and usage' }).click();
  await expect(page.getByTestId('black-hole-model-panel')).toBeVisible();
  await expect(page.getByText('Sensitive actions require approval.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start voice typing' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start voice typing' })).toBeEnabled();
  await expect(page.locator('.xv-voice-icon-only svg.lucide-mic')).toHaveCount(1);
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

test('existing conversation composer has the identical control layout without a second footer or hover hints', async ({ page }) => {
  await page.route('**/api/guest/chat', route => route.fulfill({
    status: 200, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({
      response: 'Working chat reply for composer parity verification. The request was received.',
      guestSessionId: 'composer-parity-fixture',
      guest: { limit: 10, remaining: 9, resetAt: '2099-01-01T00:00:00Z' },
    }),
  }));
  await page.goto('/workspace');
  await page.locator('[data-terminal-composer]').fill('Check the active conversation composer controls');
  await page.getByRole('button', { name: 'Send prompt', exact: true }).click();
  await expect(page.getByText('Working chat reply for composer parity verification.', { exact: false }).first()).toBeVisible();
  const frame = page.locator('.xv-terminal-dock [data-composer-frame="single"]');
  const surface = frame.locator('.xv-chatbar-solid');
  await expect(frame).toBeVisible();
  await expect(surface).toBeVisible();
  await expect.poll(async () => frame.evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('0px');
  await expect.poll(async () => surface.evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('1px');
  await expect(page.locator('.xv-chatbar-context-strip')).toHaveCount(0);
  await expect(surface.getByRole('button', { name: 'Projects' })).toBeVisible();
  await expect(surface.getByRole('button', { name: 'Plugins' })).toBeVisible();
  await expect(surface.getByRole('button', { name: 'Black Hole model and usage' })).toBeVisible();
  await expect(surface.getByRole('button', { name: 'Start voice typing' })).toBeVisible();
  // Current main uses the microphone glyph while idle and audio lines only
  // while listening. Preserve that UI choice when verifying the idle composer.
  await expect(surface.getByRole('button', { name: 'Start voice typing' })).toBeEnabled();
  await expect(surface.locator('.xv-voice-icon-only svg.lucide-mic')).toHaveCount(1);
  await surface.getByRole('button', { name: 'Black Hole model and usage' }).hover();
  await page.waitForTimeout(330);
  await expect(page.locator('.xv-compact-app-tooltip')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/composer-existing-conversation.png' });
});

test('existing conversation tools fit on a small phone without an external Plugins row', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.route('**/api/guest/chat', route => route.fulfill({
    status:200, contentType:'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ response: 'Mobile composer test response', guestSessionId:'mobile-composer-fixture',
      guest: { limit:10, remaining:9, resetAt:'2099-01-01T00:00:00Z' } }),
  }));
  await page.goto('/workspace');
  await page.locator('[data-terminal-composer]').fill('Test the narrow composer');
  await page.getByRole('button', { name: 'Send prompt', exact: true }).click();
  await expect(page.getByText('Mobile composer test response')).toBeVisible();
  const frame = page.locator('[data-composer-frame="single"]');
  const b = await frame.boundingBox();
  expect(b).not.toBeNull();
  expect(b!.x).toBeGreaterThanOrEqual(0);
  expect(b!.x+b!.width).toBeLessThanOrEqual(390);
  await expect(page.locator('.xv-chatbar-context-strip')).toHaveCount(0);
  const surface = frame.locator('.xv-chatbar-solid');
  const plugins = surface.getByRole('button', { name: 'Plugins' });
  const voice = surface.getByRole('button', { name: 'Start voice typing' });
  const send = surface.getByRole('button', { name: 'Send prompt', exact: true });
  await expect(plugins).toBeVisible();
  await expect(voice).toBeVisible();
  await expect(send).toBeVisible();
  const pluginBox = await plugins.boundingBox();
  const voiceBox = await voice.boundingBox();
  const sendBox = await send.boundingBox();
  expect(pluginBox && voiceBox && sendBox).toBeTruthy();
  expect(pluginBox!.x + pluginBox!.width).toBeLessThanOrEqual(voiceBox!.x - 1);
  expect(voiceBox!.x + voiceBox!.width).toBeLessThanOrEqual(sendBox!.x - 1);
  expect(sendBox!.x + sendBox!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/composer-existing-mobile.png' });
});

test('desktop active and new composers share a maximum 740px frame width', async ({ page }) => {
  await page.goto('/workspace');
  const frame = page.locator('.xv-terminal-dock [data-composer-frame="single"]');
  await expect(frame).toBeVisible();
  expect((await frame.boundingBox())!.width).toBeLessThanOrEqual(741);
});
