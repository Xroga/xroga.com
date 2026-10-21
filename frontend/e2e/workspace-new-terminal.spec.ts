import { test, expect, type Page } from '@playwright/test';

async function chooseStarter(page: Page, feature: string) {
  const input = page.locator('[data-terminal-composer]');
  const previous = await input.inputValue();
  await page.getByRole('menuitem', { name: feature, exact: true }).hover();
  const detail = page.getByRole('region', { name: `${feature} action`, exact: true });
  await expect(detail).toBeVisible();
  await detail.getByRole('button', { name: 'Use this in chat' }).click();
  await expect.poll(() => input.inputValue()).toContain('My goal:');
  const next = await input.inputValue();
  expect(next.startsWith(`${previous ? `${previous.trimEnd()}\n\n` : ''}I want Xroga to help with ${feature.toLowerCase()}`)).toBe(true);
  expect(next).toContain('Ask for approval before publishing, making payments, sending messages, or changing external systems.');
  expect(next).toContain('Acceptance criteria:');
  expect(next).toContain('Do not claim successful execution without evidence.');
}

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

test('canonical public composers preserve the approved Plus controls without a second composer', async ({ page }) => {
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
  await expect(actions.locator('svg.lucide-plus')).toHaveCount(1);
  await expect(actions.locator('svg')).toHaveCount(1);
  await expect(page.locator('.xv-chatbar-solid').getByRole('button', { name: 'Projects', exact: true })).toBeVisible();
  await expect(page.locator('.xv-chatbar-solid').getByRole('button', { name: 'Plugins', exact: true })).toBeVisible();
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

test('the title-bar toggle hides the single composer and restores its draft without a floating duplicate', async ({ page }) => {
  await page.goto('/workspace');
  const composer = page.locator('[data-terminal-composer]');
  const header = page.getByTestId('terminal-identity-header');
  await expect(composer).toHaveAttribute('data-draft-restoring', 'false');
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1_000));
  for (const draft of ['Retained local hide/restore draft', 'rapid second edit\n日本語', '', 'final draft']) {
  await composer.fill(draft);
  await header.getByRole('button', { name: 'Hide the chatbar', exact: true }).click();
  await expect(composer).toHaveCount(0);
  await expect(page.getByTestId('persistent-terminal-dock').getByRole('button', { name: 'Show the chatbar' })).toHaveCount(0);
  const restore = header.getByRole('button', { name: 'Show the chatbar', exact: true });
  await expect(restore).toHaveAttribute('aria-pressed', 'true');
  await restore.click();
  await expect(composer).toHaveCount(1);
  await expect(composer).toHaveValue(draft);
  await expect(header.getByRole('button', { name: 'Hide the chatbar', exact: true })).toHaveAttribute('aria-pressed', 'false');
  }
});

test('explicit hide refuses a stale account, conversation or project snapshot', async ({ page }) => {
  await page.goto('/workspace');
  const composer = page.locator('[data-terminal-composer]');
  const header = page.getByTestId('terminal-identity-header');
  await expect(composer).toBeVisible();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1_000));
  // Local defensive UI guard, not a substitute for real authenticated tests.
  for (const attribute of ['data-draft-owner', 'data-draft-session', 'data-draft-project']) {
    await composer.fill(`STALE_UI_${attribute}`);
    await composer.evaluate((element, name) => element.setAttribute(name, 'foreign-scope'), attribute);
    await header.getByRole('button', { name: 'Hide the chatbar', exact: true }).click();
    await header.getByRole('button', { name: 'Show the chatbar', exact: true }).click();
    await expect(composer).toHaveValue('');
  }
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
  await expect(page.getByRole('button', { name: 'More composer actions', exact: true })).toHaveCount(0);
});

test('visual starter stays within the pane and every control remains reachable at each viewport', async ({ page }) => {
  await page.goto('/workspace');
  const header = page.getByTestId('workspace-start-header');
  await expect(header).toBeVisible();
  await expect(header.getByRole('heading', { name: /Super Intelligence/ })).toBeVisible();
  await expect(header.locator('p')).toHaveAttribute('aria-label', /One AI workspace for every kind of work/);
  await expect(header.locator('sup')).toHaveCount(0);
  await expect(page.getByText('DESCRIBE IT.', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Xroga early access notice' })).toHaveCount(0);
  await expect(page.getByTestId('workspace-start-cards').locator('img')).toHaveCount(0);
  // Measure a stable panel through its public pause control. Rotation itself
  // is covered independently below, including its four-second interval.
  await page.getByRole('button', { name: 'Show AI Employees', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume automation rotation' })).toBeVisible();
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1280, height: 650 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    await page.setViewportSize(viewport);
    // Wait for the existing workspace's animated sidebar/pane measurement.
    await page.waitForTimeout(800);
    const dock = page.getByTestId('persistent-terminal-dock');
    const sizes = await dock.evaluate(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth, height: el.clientHeight, scrollHeight: el.scrollHeight }));
    expect(sizes.scrollWidth, JSON.stringify(viewport)).toBeLessThanOrEqual(sizes.width + 1);
    // The current idle dock explicitly permits vertical scrolling. Verify
    // containment and actual reachability instead of requiring a retired fit.
    expect(sizes.height, JSON.stringify(viewport)).toBeLessThanOrEqual(viewport.height);
    expect(await dock.evaluate(el => getComputedStyle(el).overflowY)).toBe('auto');
    const lastCard = page.locator('[data-capability]').last();
    await lastCard.scrollIntoViewIfNeeded();
    await expect(lastCard).toBeInViewport();
    if (sizes.scrollHeight > sizes.height + 1) {
      // Overflow can be only bottom padding, so scrollIntoView needn't move.
      // Exercise the actual scroll range explicitly before asserting it.
      await dock.evaluate(el => { el.scrollTop = el.scrollHeight; });
      expect(await dock.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    }
    const input = page.locator('[data-terminal-composer]');
    await input.scrollIntoViewIfNeeded();
    await expect(input).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
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
  await chooseStarter(page, 'Documents');
  await expect(input).toHaveValue(/My goal: Draft a document about:/);
  await input.fill('My exact written brief');
  await cards.getByRole('button', { name: 'Find', exact: true }).click();
  await chooseStarter(page, 'Web research');
  await expect(input).toHaveValue(/^My exact written brief\n\nI want Xroga[\s\S]*My goal: Research this topic on the web and cite sources:/);
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
  await chooseStarter(page, 'Images');
  await expect(input).toHaveValue(/My goal: Create an image of:/);
  await page.locator('[data-capability="build"]').click();
  // PR833 makes focus reveal the category detail. Both the detail action and
  // Back remain keyboard reachable, with Escape dismissing the whole portal.
  await page.getByRole('menuitem', { name: 'Apps', exact: true }).focus();
  await expect(page.getByRole('region', { name: 'Apps action', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to categories', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('group', { name: 'Build categories', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Build features' })).toHaveCount(0);
  for (const [id, feature, expected] of [
    ['find', 'Files & knowledge', 'Find and summarize'], ['build', 'APIs & databases', 'Design and build'],
    ['ship', 'Test a project', 'Test this project'],
  ]) {
    await page.locator(`[data-capability="${id}"]`).click();
    await chooseStarter(page, feature);
    await expect(input).toHaveValue(new RegExp(`My goal: ${expected}`));
  }
  for (const [title, id, feature, expected] of [
    ['AI Employees', 'employees', 'Research assistant', 'Help me delegate'],
    ['Browser automation', 'browser', 'Browser testing', 'Test this website'],
    ['Apps & plugins', 'plugins', 'App automation', 'Build an automation'],
  ]) {
    await page.getByRole('button', { name: `Show ${title}`, exact: true }).click();
    await page.locator(`[data-capability="${id}"]`).click();
    await chooseStarter(page, feature);
    await expect(input).toHaveValue(new RegExp(`My goal: ${expected}`));
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

test('solid model and plus menus are monochrome and mobile preserves the readable model name', async ({ page }) => {
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
  // Approved PR833 explicitly keeps the readable name on mobile and hides the
  // decorative substitute. Preserve routing access and both menu behaviors.
  await expect(model.locator('span')).toBeVisible();
  await expect(model.locator('span')).toHaveText('Black Hole V∞');
  await expect(page.getByTestId('mobile-model-icon')).toBeHidden();
  await page.locator('[data-capability="create"]').click();
  await chooseStarter(page, 'Documents');
  await expect(page.locator('[data-terminal-composer]')).toHaveValue(/My goal: Draft a document about:/);
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
  const overview = sidebar.getByRole('link', { name: 'Overview', exact: true });
  await expect(overview).toBeVisible();
  await expect(overview).toHaveAttribute('href', '/dashboard');
  await expect(sidebar.getByRole('link', { name: 'Projects', exact: true })).toHaveAttribute('href', '/dashboard/projects');
  await expect(sidebar.getByRole('button', { name: 'New Work', exact: true })).toBeVisible();
  // Workspace remains a separate shortcut alongside Overview.
  const workspace = sidebar.getByRole('link', { name: 'Workspace', exact: true });
  await expect(workspace).toBeVisible();
  await expect(workspace).toHaveAttribute('href', '/workspace');
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
  const search = page.getByRole('button', { name: 'Search workspace', exact: true });
  await search.click();
  const dialog = page.getByRole('dialog', { name: 'Search projects and chats' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS('background-color', 'rgb(25, 25, 25)');
  expect(await dialog.evaluate(el => el.parentElement?.parentElement === document.body)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('automatic intro reveals its second line after delay without a model picker', async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.goto('/workspace');
  const first = page.locator('[data-visible]').filter({ hasText: 'No models or tools to choose.' });
  const detail = page.locator('[data-visible]').filter({ hasText: 'Type or speak your goal. Xroga chooses the right tools and handles the work.' });
  await expect(first).toHaveAttribute('data-visible', 'true');
  await expect(first).toHaveAttribute('aria-hidden', 'false');
  await expect(detail).toHaveAttribute('data-visible', 'false');
  await expect(detail).toHaveAttribute('aria-hidden', 'true');
  await page.clock.fastForward(2100);
  await expect(detail).toHaveAttribute('data-visible', 'false');
  await page.clock.fastForward(200);
  await expect(first).toHaveAttribute('data-visible', 'false');
  await expect(first).toHaveAttribute('aria-hidden', 'true');
  await expect(detail).toHaveAttribute('data-visible', 'true');
  await expect(detail).toHaveAttribute('aria-hidden', 'false');
  await expect(page.getByRole('button', { name: 'Choose model', exact: true })).toHaveCount(0);
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
