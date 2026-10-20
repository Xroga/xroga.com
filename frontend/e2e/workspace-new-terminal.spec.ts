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
  await expect(header.locator('p')).toHaveAttribute('aria-label', /One AI workspace for every kind of work/);
  await expect(header.locator('sup')).toHaveCount(0);
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
    await expect(page.locator('[data-capability]')).toHaveCount(5);
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
  await cards.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Documents', exact: true }).click();
  await expect(input).toHaveValue('Draft a document about: ');
  await input.fill('My exact written brief');
  await cards.getByRole('button', { name: 'Find', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Web research', exact: true }).click();
  await expect(input).toHaveValue('My exact written brief\n\nResearch this topic on the web and cite sources: ');
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

test('feature menus open only on click, support keyboard and never send', async ({ page }) => {
  let requests = 0;
  page.on('request', request => { if (request.url().includes('/api/guest/chat')) requests++; });
  await page.goto('/workspace');
  const input = page.locator('[data-terminal-composer]');
  await page.locator('[data-capability="create"]').hover();
  await expect(page.getByRole('menu', { name: 'Create features' })).toHaveCount(0);
  await page.locator('[data-capability="create"]').click();
  await expect(page.getByRole('menu', { name: 'Create features' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Images', exact: true }).click();
  await expect(input).toHaveValue('Create an image of: ');
  await page.locator('[data-capability="build"]').click();
  await expect(page.getByRole('menuitem', { name: 'Websites', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Apps', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Build features' })).toHaveCount(0);
  for (const [id, feature, expected] of [
    ['find', 'Files & knowledge', 'Find and summarize'], ['build', 'APIs & databases', 'Design and build'],
    ['ship', 'Test a project', 'Test this project'],
  ]) {
    await page.locator(`[data-capability="${id}"]`).click();
    await page.getByRole('menuitem', { name: feature, exact: true }).click();
    await expect(input).toHaveValue(new RegExp(`^${expected}`));
  }
  for (const [title, id, feature, expected] of [
    ['AI Employees', 'employees', 'Research assistant', 'Help me delegate'],
    ['Browser automation', 'browser', 'Browser testing', 'Test this website'],
    ['Apps & plugins', 'plugins', 'App automation', 'Build an automation'],
  ]) {
    await page.getByRole('button', { name: `Show ${title}`, exact: true }).click();
    await page.locator(`[data-capability="${id}"]`).click();
    await page.getByRole('menuitem', { name: feature, exact: true }).click();
    await expect(input).toHaveValue(new RegExp(`^${expected}`));
  }
  expect(requests).toBe(0);
});

test('automation panels rotate every four seconds and dots pause on a selected panel', async ({ page }) => {
  await page.clock.install();
  await page.goto('/workspace');
  await expect(page.locator('[data-capability="employees"]')).toBeVisible();
  await page.clock.fastForward(4100);
  await expect(page.locator('[data-capability="browser"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause workspace examples' })).toHaveCount(0);
  await page.clock.fastForward(4100);
  await expect(page.locator('[data-capability="plugins"]')).toBeVisible();
  await page.getByRole('button', { name: 'Show AI Employees', exact: true }).click();
  await page.clock.fastForward(6500);
  await expect(page.locator('[data-capability="employees"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume automation rotation' })).toBeVisible();
});

test('solid model and plus menus are monochrome and mobile uses only a model symbol', async ({ page }) => {
  await page.goto('/workspace');
  await expect(page.getByTestId('workspace-start-header')).toBeVisible();
  await expect(page.locator('.xv-workspace-shell')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  const model = page.getByRole('button', { name: 'Black Hole V model', exact: true });
  await expect(model.locator('span')).toBeVisible();
  await expect(page.getByTestId('mobile-model-icon')).toBeHidden();
  await model.click();
  const panel = page.getByTestId('black-hole-model-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveCSS('backdrop-filter', 'none');
  await expect(panel).toHaveCSS('background-color', 'rgb(22, 22, 22)');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'More composer actions' }).click();
  await expect(page.getByRole('dialog', { name: 'Composer actions' })).toHaveCSS('filter', 'grayscale(1)');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(model.locator('span')).toBeHidden();
  await expect(page.getByTestId('mobile-model-icon')).toBeVisible();
  await page.locator('[data-capability="create"]').click();
  await page.getByRole('menuitem', { name: 'Documents', exact: true }).click();
  await expect(page.locator('[data-terminal-composer]')).toHaveValue('Draft a document about: ');
});

test('mobile header joins the workspace and shortcuts reveal descriptions on tap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/workspace');
  await expect(page.getByTestId('workspace-start-cards')).toBeVisible();
  const toolbar = await page.locator('.xv-mobile-workspace-pill').boundingBox();
  const shell = await page.locator('.xv-workspace-shell').boundingBox();
  expect(Math.abs(toolbar!.y + toolbar!.height - shell!.y)).toBeLessThanOrEqual(1);
  expect(toolbar!.x).toBe(shell!.x);
  expect(toolbar!.width).toBe(shell!.width);
  await expect(page.locator('[data-capability="create"] strong')).toBeHidden();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Create features' })).toContainText('Turn ideas into documents, slides, images and videos.');
});

test('model app preference saves through the existing policy API and keeps failures visible', async ({ page }) => {
  let mode = 'low_risk';
  let fail = false;
  await page.route('**/api/integrations/xroga-connect/permission-policy', async route => {
    if (route.request().method() === 'PATCH') {
      if (fail) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture failure' }) });
      mode = route.request().postDataJSON().mode;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, mode }) });
  });
  await page.goto('/workspace');
  const model = page.getByRole('button', { name: 'Black Hole V model', exact: true });
  await model.click();
  const setting = page.getByLabel('Connected app permissions', { exact: true });
  await expect(setting).toBeEnabled();
  await expect(setting).toHaveValue('low_risk');
  await setting.selectOption('always_ask');
  await expect(setting).toHaveValue('always_ask');
  await page.keyboard.press('Escape');
  await model.click();
  await expect(setting).toHaveValue('always_ask');
  fail = true;
  await setting.selectOption('full_access');
  await expect(page.getByText('Could not save. Your previous setting is unchanged.')).toBeVisible();
  await expect(setting).toHaveValue('always_ask');
  await expect(page.getByTestId('black-hole-model-panel')).toContainText('Required');
});
