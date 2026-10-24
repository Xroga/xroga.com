import { test, expect } from '@playwright/test';

// Local UI fixtures only: no authentication bypass or real model requests.
test.use({ bypassCSP: true });

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
    throw new Error('Run this mocked interaction test against a local preview only.');
  }
  // This UI fixture must never send authentication traffic to a live project.
  await page.route('https://*.supabase.co/**', route => route.abort());
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

test('starter plus is opt-in and conversation restores the ordinary ring without a second composer', async ({ page }) => {
  await page.goto('/workspace');
  const composer = page.locator('[data-terminal-composer]');
  const actions = page.getByRole('button', { name: 'More composer actions', exact: true });
  await expect(page.getByTestId('workspace-start-header')).toBeVisible();
  await expect(actions.locator('svg.lucide-plus')).toHaveCount(1);
  await expect(composer).toHaveCount(1);
  await composer.fill('Local icon-transition fixture');
  await page.getByRole('button', { name: 'Send prompt', exact: true }).click();
  await expect(page.getByText('Local UI fixture reply verified.', { exact: false }).first()).toBeVisible();
  await expect(page.getByTestId('workspace-start-header')).toHaveCount(0);
  await expect(page.getByTestId('workspace-start-cards')).toHaveCount(0);
  await expect(actions.locator('svg.lucide-plus')).toHaveCount(0);
  await expect(actions.locator('svg')).toHaveCount(1);
  await expect(composer).toHaveCount(1);
});

test('fullscreen preserves the current starter, draft and one composer on entry and exit', async ({ page }) => {
  await page.goto('/workspace');
  const composer = page.locator('[data-terminal-composer]');
  await expect(page.getByTestId('workspace-start-header')).toBeVisible();
  await composer.fill('Draft retained through fullscreen');
  const header = page.getByTestId('terminal-identity-header');
  await header.getByRole('button', { name: 'Fullscreen terminal', exact: true }).click();
  await expect(page.locator('body')).toHaveClass(/xv-terminal-fullscreen-active/);
  await expect(page.getByTestId('workspace-start-header')).toBeVisible();
  await expect(page.getByTestId('workspace-start-cards')).toBeVisible();
  await expect(composer).toHaveCount(1);
  await expect(composer).toHaveValue('Draft retained through fullscreen');
  await header.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
  await expect(page.locator('body')).not.toHaveClass(/xv-terminal-fullscreen-active/);
  await expect(composer).toHaveValue('Draft retained through fullscreen');
});

test('private empty workspace never exposes starter cards or starter plus', async ({ page }) => {
  await page.addInitScript(() => {
    // Persist a preference belonging to this guest, not an authenticated session.
    // Missing cache ownership correctly purges legacy cross-account preferences.
    localStorage.setItem('xroga-cache-owner', 'v2:guest');
    localStorage.setItem('xroga-privacy-v1', JSON.stringify({ state: { incognito: true }, version: 0 }));
  });
  await page.goto('/workspace');
  await expect(page.locator('[data-terminal-composer]')).toHaveCount(1);
  await expect(page.locator('[data-terminal-composer]')).toHaveAttribute('placeholder', 'Type a private message…');
  await expect(page.getByTestId('workspace-start-header')).toHaveCount(0);
  await expect(page.getByTestId('workspace-start-cards')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'More composer actions', exact: true }).locator('svg.lucide-plus')).toHaveCount(0);
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

test('profile drawer and prompt share controls remain accessible without destructive user actions', async ({ page }) => {
  await page.goto('/workspace');
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Workspace profile' });
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await page.locator('[data-terminal-composer]').fill('Local prompt sharing test');
  await page.getByRole('button', { name: 'Send prompt', exact: true }).click();
  await expect(page.getByText('Local UI fixture reply verified.', { exact: false }).first()).toBeVisible();
  const userTurn = page.locator('[data-turn-id]').filter({ hasText: 'Local prompt sharing test' }).first();
  await userTurn.hover();
  await expect(userTurn.getByRole('button', { name: 'Delete message' })).toHaveCount(0);
  await userTurn.getByRole('button', { name: 'Share prompt', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Share this prompt' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Response only', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create owner-only link' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Xroga early access notice' })).toHaveCount(0);
});

test('sidebar flyouts paint one solid rounded surface without a backing rectangle', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/workspace');
  for (const theme of ['White', 'Beige', 'Gray', 'Black']) {
    await page.getByRole('button', { name: 'Change theme', exact: true }).first().click();
    await page.getByRole('menuitemradio', { name: new RegExp(`^${theme}`) }).click();
    await page.getByRole('link', { name: 'Library', exact: true }).hover();
    const popup = page.locator('.xv-sidebar-hover-menu');
    await expect(popup).toBeVisible();
    await expect(popup).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const card = popup.locator('.xv-sidebar-hover-menu__card');
    await expect(card).toBeVisible();
    expect(await card.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Close sidebar', exact: true }).click();
  const shortcuts = page.locator('.xv-sidebar-collapsed-actions');
  await expect(shortcuts.getByRole('link', { name: 'Workspace', exact: true })).toHaveCount(0);
  await expect(shortcuts.getByRole('link', { name: 'Projects', exact: true })).toHaveCount(0);
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
  await page.getByRole('button', { name: /New Work|New terminal/i }).first().click();
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
  const model = page.getByRole('button', { name: 'Automatic model and tool routing', exact: true });
  await expect(model.locator('span')).toBeVisible();
  await expect(page.getByTestId('mobile-model-icon')).toBeHidden();
  await model.click();
  const panel = page.getByTestId('black-hole-model-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveCSS('backdrop-filter', 'none');
  await expect(panel).toHaveCSS('background-color', 'rgb(22, 22, 22)');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'More composer actions' }).click();
  await expect(page.getByRole('dialog', { name: 'Composer actions' })).toHaveCSS('filter', 'none');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(model.locator('span')).toBeHidden();
  await expect(page.getByTestId('mobile-model-icon')).toBeVisible();
  await page.locator('[data-capability="create"]').click();
  await page.getByRole('menuitem', { name: 'Documents', exact: true }).click();
  await expect(page.locator('[data-terminal-composer]')).toHaveValue('Draft a document about: ');
});

test('mobile header joins the workspace and five cards reveal descriptions on tap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/workspace');
  await expect(page.getByTestId('workspace-start-cards')).toBeVisible();
  const toolbar = await page.locator('.xv-mobile-workspace-pill').boundingBox();
  const shell = await page.locator('.xv-workspace-shell').boundingBox();
  expect(Math.abs(toolbar!.y + toolbar!.height - shell!.y)).toBeLessThanOrEqual(1);
  expect(toolbar!.x).toBe(shell!.x);
  expect(toolbar!.width).toBe(shell!.width);
  await expect(page.locator('[data-capability="create"] strong')).toBeVisible();
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
  const model = page.getByRole('button', { name: 'Automatic model and tool routing', exact: true });
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
  await expect(page.getByTestId('black-hole-model-panel')).toContainText('Sensitive actions require approval.');
});

test('compact sidebar keeps utilities and primary destinations in two aligned rows', async ({ page }) => {
  await page.goto('/workspace');
  const sidebar = page.locator('.xv-sidebar-root');
  const utilities = sidebar.locator('.xv-sidebar-utilities button');
  await expect(utilities).toHaveCount(3);
  const boxes = await utilities.evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { y: r.y, right: r.right }; }));
  expect(new Set(boxes.map(box => box.y)).size).toBe(1);
  const bounds = await sidebar.boundingBox();
  expect(Math.max(...boxes.map(box => box.right))).toBeLessThanOrEqual(bounds!.x + bounds!.width);
  await expect(sidebar.getByRole('link', { name: 'Overview', exact: true })).toHaveCount(1);
  await expect(sidebar.getByRole('button', { name: 'New Work', exact: true })).toBeVisible();
  await sidebar.getByRole('button', { name: 'Close sidebar', exact: true }).click();
  await expect(sidebar).toHaveClass(/is-collapsed/);
  await expect(sidebar.getByRole('link', { name: 'Overview', exact: true })).toBeVisible();
  await sidebar.locator('img').first().hover();
  await page.waitForTimeout(500);
  await expect(sidebar).toHaveClass(/is-collapsed/);
  await sidebar.locator('img').first().click();
  await expect(sidebar).not.toHaveClass(/is-collapsed/);
  const handle = await page.getByRole('separator', { name: 'Resize sidebar' }).boundingBox();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + 100);
  await page.mouse.down();
  await page.mouse.move(80, handle!.y + 100, { steps: 12 });
  await page.mouse.up();
  await expect(sidebar).toHaveClass(/is-collapsed/);
});

test('plus menu follows the empty or working composer and model stays uncovered', async ({ page }) => {
  await page.goto('/workspace');
  await expect(page.getByTestId('workspace-start-cards')).toBeVisible();
  await page.getByRole('button', { name: 'More composer actions' }).click();
  let composer = await page.locator('.xv-chatbar-solid').boundingBox();
  let menu = await page.getByRole('dialog', { name: 'Composer actions' }).boundingBox();
  expect(menu!.y).toBeGreaterThan(composer!.y + composer!.height);
  const frame = await page.locator('.xv-kimi-composer-frame').boundingBox();
  expect(Math.abs(menu!.width - frame!.width)).toBeLessThan(2);
  await page.keyboard.press('Escape');
  const model = page.getByRole('button', { name: 'Automatic model and tool routing', exact: true });
  await model.click();
  const panel = await page.getByTestId('black-hole-model-panel').boundingBox();
  const trigger = await model.boundingBox();
  expect(panel!.height).toBeLessThan(230);
  expect(panel!.y + panel!.height).toBeLessThanOrEqual(trigger!.y);
  await page.keyboard.press('Escape');
  await page.locator('[data-terminal-composer]').fill('Check active composer');
  await page.getByRole('button', { name: 'Send prompt', exact: true }).click();
  await expect(page.getByText('Local UI fixture reply verified.', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'More composer actions' }).click();
  composer = await page.locator('.xv-chatbar-solid').boundingBox();
  menu = await page.getByRole('dialog', { name: 'Composer actions' }).boundingBox();
  expect(menu!.y + menu!.height).toBeLessThan(composer!.y);
});

test('mobile tagline stays on one line and tool picks are editable, removable and not auto-sent', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let sends = 0;
  page.on('request', request => { if (request.url().includes('/api/guest/chat')) sends++; });
  await page.goto('/workspace');
  const tagline = page.getByTestId('workspace-start-header').locator('p');
  await expect(tagline).toContainText('One AI workspace for every kind of ');
  expect(await tagline.evaluate(el => getComputedStyle(el).whiteSpace)).toBe('nowrap');
  await page.getByRole('button', { name: 'More composer actions' }).click();
  const menu = page.getByRole('dialog', { name: 'Composer actions' });
  await expect(menu.getByRole('button', { name: /Library/ })).toBeVisible();
  await menu.getByRole('button', { name: /Library/ }).click();
  await menu.getByRole('button', { name: /Summarize files/ }).click();
  await expect(page.locator('[data-terminal-composer]')).toHaveValue('Summarize these files and list the important findings: ');
  await expect(page.getByLabel('Selected composer tools')).toContainText('Summarize files');
  await page.getByRole('button', { name: 'Remove Summarize files selection' }).click();
  await expect(page.getByLabel('Selected composer tools')).toHaveCount(0);
  await expect(page.locator('[data-terminal-composer]')).toHaveValue('');
  expect(sends).toBe(0);
});

test('search dialog escapes workspace stacking context and has an opaque foreground', async ({ page }) => {
  await page.goto('/workspace');
  const search = page.getByRole('button', { name: 'Search', exact: true }).first();
  await search.click();
  const dialog = page.getByRole('dialog', { name: 'Search projects and chats' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS('background-color', 'rgb(25, 25, 25)');
  expect(await dialog.evaluate(el => el.parentElement?.parentElement === document.body)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('automatic intro reveals its second line after delay without a model picker', async ({ page }) => {
  await page.goto('/workspace');
  const detail = page.locator('[data-visible]').filter({ hasText: 'No models or tools to choose.' });
  await expect(detail).toHaveAttribute('data-visible', 'false');
  await page.waitForTimeout(2400);
  await expect(detail).toHaveAttribute('data-visible', 'true');
  await expect(page.getByTestId('workspace-start-header').locator('p')).toContainText('One AI workspace for every kind of ');
});

test('contextual tools have colored hover states, and selected chips show details and removal', async ({ page }) => {
  await page.goto('/workspace');
  await page.getByRole('button', { name: 'More composer actions' }).click();
  const menu = page.getByRole('dialog', { name: 'Composer actions' });
  await expect(menu).not.toContainText('Choose a tool, or describe your task');
  await expect(menu.locator('.xv-cba-integrations-logo')).toHaveCount(0);
  const plan = menu.getByRole('button', { name: /Plan before build/ });
  await plan.hover();
  await expect(plan).toHaveAttribute('data-tone', 'orange');
  await plan.click();
  const chip = page.getByRole('button', { name: 'About Plan before build' });
  await expect(chip).toBeVisible();
  await chip.hover();
  await expect(page.getByRole('menu', { name: 'Plan before build details' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove Plan before build selection' }).click();
  await expect(chip).toHaveCount(0);
});
