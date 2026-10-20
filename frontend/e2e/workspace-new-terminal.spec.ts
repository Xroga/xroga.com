import { test, expect } from '@playwright/test';

// Local UI fixtures only: no authentication bypass or real model requests.
test.use({ bypassCSP: true });

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
    throw new Error('Run this mocked interaction test against a local preview only.');
  }
  await page.route('**/api/guest/chat', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({
      response: 'Local UI fixture reply verified.',
      guestSessionId: 'local-workspace-ui-fixture',
      guest: { limit: 10, remaining: 9, resetAt: '2099-01-01T00:00:00Z' },
    }),
  }));
});

test('compact visual starter fits desktop, tablet and phones without overflowing', async ({ page }) => {
  await page.goto('/workspace');
  const header = page.getByTestId('workspace-start-header');
  await expect(header).toBeVisible();
  await expect(header.getByRole('heading', { name: /Super Intelligence/ })).toBeVisible();
  await expect(header).toContainText('One AI workspace for every kind of work.');
  await expect(page.getByText('DESCRIBE IT.', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Xroga early access notice' })).toHaveCount(0);
  await expect(page.getByTestId('workspace-start-cards').locator('img')).toHaveCount(0);
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1280, height: 650 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    await page.setViewportSize(viewport);
    // Wait for the existing workspace's animated sidebar/pane measurement.
    await page.waitForTimeout(800);
    const dock = page.getByTestId('persistent-terminal-dock');
    const sizes = await dock.evaluate(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth, height: el.clientHeight, scrollHeight: el.scrollHeight }));
    expect(sizes.scrollWidth, JSON.stringify(viewport)).toBeLessThanOrEqual(sizes.width + 1);
    expect(sizes.scrollHeight, JSON.stringify(viewport)).toBeLessThanOrEqual(sizes.height + 1);
    await expect(page.getByTestId('workspace-start-cards').getByRole('button')).toHaveCount(5);
    await expect(page.locator('[data-terminal-composer]')).toHaveCount(1);
    await expect(header.locator('img')).toHaveCount(0);
    const descriptions = await page.locator('[data-capability] strong + span').evaluateAll(elements => elements.map(el => parseFloat(getComputedStyle(el).fontSize)));
    expect(descriptions.every(size => size >= 12)).toBe(true);
  }
});

test('theme picker updates the workspace, cards and composer and survives reload', async ({ page }) => {
  await page.goto('/workspace');
  await expect(page.getByTestId('workspace-start-cards')).toBeVisible();
  const palettes: string[][] = [];
  for (const theme of ['White', 'Beige', 'Gray', 'Black']) {
    await page.getByRole('button', { name: 'Change theme', exact: true }).first().click();
    await page.getByRole('menuitemradio', { name: new RegExp(`^${theme}`) }).click();
    await expect(page.locator('body')).toHaveClass(new RegExp(`theme-${theme.toLowerCase()}`));
    await page.waitForTimeout(300);
    const colors = await page.evaluate(() => ['.xv-workspace-shell', '[data-capability="create"]', '.xv-chatbar-solid'].map(selector => getComputedStyle(document.querySelector(selector)!).backgroundColor));
    palettes.push(colors);
    if (theme === 'White' || theme === 'Beige') {
      for (const color of colors) {
        const values = color.match(/[\d.]+/g)!.map(Number);
        // color-mix serializes as color(srgb ...) in Chromium.
        const red = color.startsWith('color(') ? values[0] * 255 : values[0];
        expect(red).toBeGreaterThan(200);
      }
    }
  }
  for (let surface = 0; surface < 3; surface++) expect(new Set(palettes.map(colors => colors[surface])).size).toBe(4);
  await page.reload();
  await expect(page.getByTestId('workspace-start-cards')).toBeVisible();
  await expect(page.locator('.xv-workspace-shell')).toHaveCSS('background-color', palettes[3][0]);
});

test('cards preserve drafts and conversation removes all starter styling', async ({ page }) => {
  await page.goto('/workspace');
  const cards = page.getByTestId('workspace-start-cards');
  const input = page.locator('[data-terminal-composer]');
  await expect(cards).toBeVisible();
  await cards.getByRole('button', { name: /^Create / }).click();
  await expect(input).toHaveValue('Create ');
  await input.fill('My exact written brief');
  await cards.getByRole('button', { name: /^Find / }).click();
  await expect(input).toHaveValue('My exact written brief');
  await input.fill('Hello, local UI fixture test');
  await page.getByRole('button', { name: 'Send prompt', exact: true }).click();
  await expect(page.getByText('Local UI fixture reply verified.', { exact: false }).first()).toBeVisible();
  await expect(page.getByTestId('workspace-start-header')).toHaveCount(0);
  await expect(cards).toHaveCount(0);
  await expect(input).toHaveCount(1);
  await expect(page.getByTestId('persistent-terminal-dock')).not.toHaveClass(/WorkspaceNewTerminal_dock/);
  await page.getByRole('button', { name: /New terminal/i }).first().click();
  // Guest New Terminal remains account-gated; the redesign cannot bypass it.
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(cards).toHaveCount(0);
});
