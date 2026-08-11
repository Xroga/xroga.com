import { expect, test } from '@playwright/test';

/**
 * Proves each showcase product actually works, rather than merely rendering.
 *
 * A product marked `live` in the registry claims real functionality, so each test
 * here drives the behaviour the registry advertises.
 */

const preview = (slug: string) => `/showcase/${slug}/preview`;

const ALL = [
  'modern-business-website',
  'real-estate-platform',
  'booking-platform',
  'android-app',
  'ai-saas-chatbot',
  'playable-web-game',
];

test('every product renders its own heading with no page errors', async ({ page }) => {
  for (const slug of ALL) {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    const response = await page.goto(preview(slug));
    expect(response?.status(), slug).toBe(200);
    await expect(page.getByRole('heading', { level: 1 }).first(), slug).toBeVisible();
    expect(errors, `${slug} threw: ${errors[0] ?? ''}`).toEqual([]);
    page.removeAllListeners('pageerror');
  }
});

/**
 * The app's globals.css styles `h1..h6` by element selector, which once repainted a
 * dark product's headings in the app's light foreground colour. Each product resets
 * that, and this guards the reset.
 */
test('product headings are not repainted by the host app stylesheet', async ({ page }) => {
  await page.goto(preview('playable-web-game'));
  const contrast = await page.evaluate(() => {
    const heading = document.querySelector('.dl-overlay-title');
    const panel = document.querySelector('.dl-canvas-wrap');
    if (!heading || !panel) return null;
    const parse = (value: string) => (value.match(/\d+/g) ?? []).slice(0, 3).map(Number);
    const luminance = (rgb: number[]) =>
      rgb.length === 3 ? (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 : null;
    const text = luminance(parse(getComputedStyle(heading).color));
    const bg = luminance(parse(getComputedStyle(panel).backgroundColor));
    return text === null || bg === null ? null : Math.abs(text - bg);
  });
  expect(contrast).not.toBeNull();
  // A dark-on-dark heading lands near zero; legible light-on-dark is far from it.
  expect(contrast!).toBeGreaterThan(0.4);
});

test('real estate: filters, sorting, favourites and the drawer all work', async ({ page }) => {
  await page.goto(preview('real-estate-platform'));
  const count = page.locator('.hl-count strong');
  const total = Number(await count.innerText());
  expect(total).toBeGreaterThan(0);

  // A search narrows the result set. Scoped to the input: the results section is
  // also labelled "Search results".
  await page.getByRole('searchbox', { name: 'Search' }).fill('loft');
  await expect.poll(async () => Number(await count.innerText())).toBeLessThan(total);

  // Clearing restores it.
  await page.getByRole('button', { name: /^Clear \d+$/ }).click();
  await expect.poll(async () => Number(await count.innerText())).toBe(total);

  // Sorting by price actually reorders.
  await page.getByLabel('Sort').selectOption('price-asc');
  const prices = await page.locator('.hl-card .hl-price').allInnerTexts();
  const numeric = prices.map((value) => Number(value.replace(/[^0-9]/g, '')));
  expect(numeric).toEqual([...numeric].sort((a, b) => a - b));

  // A bedroom filter excludes smaller properties.
  await page.getByRole('button', { name: '4+' }).click();
  await expect.poll(async () => Number(await count.innerText())).toBeLessThan(total);

  // Favourites survive a reload, because they are persisted.
  await page.getByRole('button', { name: 'Any' }).click();
  await page.locator('.hl-heart').first().click();
  await expect(page.locator('.hl-fav-badge')).toHaveText('1');
  await page.reload();
  await expect(page.locator('.hl-fav-badge')).toHaveText('1');

  // The detail drawer opens and closes.
  await page.getByRole('button', { name: 'View details' }).first().click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(/price per sq ft/i)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
});

test('real estate: the mortgage calculator computes real amortisation', async ({ page }) => {
  await page.goto(preview('real-estate-platform'));
  const monthly = page.locator('.hl-calc-big');
  const before = Number((await monthly.innerText()).replace(/[^0-9]/g, ''));
  expect(before).toBeGreaterThan(0);

  // A larger deposit must lower the monthly payment.
  const deposit = page.locator('#\\:R2m\\:-dep, input[type=range]').nth(1);
  await deposit.evaluate((element: HTMLInputElement) => {
    element.value = '50';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(async () => Number((await monthly.innerText()).replace(/[^0-9]/g, ''))).toBeLessThan(before);
});

test('booking: availability responds to guests, and the flow reaches confirmation', async ({ page }) => {
  await page.goto(preview('booking-platform'));
  const nights = page.locator('.wf-nights');
  await expect(nights).toContainText(/night/);

  const initial = await page.locator('.wf-card').count();
  expect(initial).toBeGreaterThan(0);

  // Six guests must exclude properties that cannot sleep six.
  await page.getByLabel('Guests').selectOption('6');
  await expect.poll(async () => page.locator('.wf-card').count()).toBeLessThan(initial);

  await page.getByLabel('Guests').selectOption('2');
  await page.getByRole('button', { name: 'Select' }).first().click();

  // The details step refuses to advance while empty.
  await page.getByRole('button', { name: /review reservation/i }).click();
  await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();

  await page.getByLabel('Lead guest name').fill('Sample Guest');
  await page.getByLabel('Email').fill('guest@example.com');
  await page.getByRole('button', { name: /review reservation/i }).click();

  // The review step must state that no payment is taken.
  await expect(page.getByText(/no payment is collected/i)).toBeVisible();
  await page.getByRole('button', { name: /confirm sample reservation/i }).click();
  await expect(page.getByRole('heading', { name: /sample reservation recorded/i })).toBeVisible();
  await expect(page.getByText(/nothing was charged/i)).toBeVisible();
});

test('booking: the price breakdown is arithmetic, not a fixed figure', async ({ page }) => {
  await page.goto(preview('booking-platform'));
  await page.getByRole('button', { name: 'Select' }).first().click();

  const total = page.locator('.wf-total strong');
  const shortStay = Number((await total.innerText()).replace(/[^0-9]/g, ''));

  // Extending the stay must raise the total.
  await page.getByRole('button', { name: /back to results/i }).click();
  const checkout = page.getByLabel('Check out');
  const current = await checkout.inputValue();
  const later = new Date(`${current}T00:00:00`);
  later.setDate(later.getDate() + 4);
  await checkout.fill(later.toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Select' }).first().click();

  await expect.poll(async () => Number((await total.innerText()).replace(/[^0-9]/g, ''))).toBeGreaterThan(shortStay);
});

test('mobile app: tabs, search, saving and settings all work', async ({ page }) => {
  await page.goto(preview('android-app'));

  // The no-shipped-release statement must be present and unambiguous.
  await expect(page.getByText(/not a shipped release/i)).toBeVisible();
  await expect(page.getByText(/no apk has been built/i)).toBeVisible();

  const items = page.locator('.fb-item');
  const total = await items.count();
  expect(total).toBeGreaterThan(0);

  // Category filter narrows the list.
  await page.getByRole('button', { name: 'Birds', exact: true }).click();
  await expect.poll(async () => items.count()).toBeLessThan(total);
  await page.getByRole('button', { name: 'All', exact: true }).click();

  // Saved starts empty, then reflects a save made from the detail sheet.
  await page.getByRole('button', { name: 'Saved', exact: true }).click();
  await expect(page.getByText(/nothing saved yet/i)).toBeVisible();

  await page.getByRole('button', { name: 'Browse', exact: true }).click();
  await items.first().click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('button', { name: 'Saved', exact: true }).click();
  await expect(page.locator('.fb-count-pill')).toHaveText('1');

  // A settings switch is a real control and toggles.
  await page.getByRole('button', { name: 'Settings' }).click();
  const toggle = page.getByRole('switch', { name: /larger text/i });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
});

test('ai saas: streams a real-provider response through the public server route', async ({ page }) => {
  await page.route('**/api/showcase/aura/health', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"configured":true,"provider":"Groq"}' }));
  await page.route('**/api/showcase/aura/chat', (route) => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: 'data: {"choices":[{"delta":{"content":"A live streamed answer"}}]}\n\ndata: [DONE]\n\n',
  }));
  await page.goto(preview('ai-saas-chatbot'));
  await expect(page.getByText('Groq live')).toBeVisible();
  await page.getByLabel('Message Aura').fill('Explain this product in one sentence');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('.aura-message.assistant .aura-message-body')).toHaveText('A live streamed answer');
});

test('ai saas: history, model selection, theme, and settings are interactive', async ({ page }) => {
  await page.route('**/api/showcase/aura/health', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"configured":false,"provider":"Groq"}' }));
  await page.goto(preview('ai-saas-chatbot'));
  await expect(page.getByText('Demo offline')).toBeVisible();
  await page.getByRole('button', { name: /Llama 3.3 70B/ }).click();
  await page.getByRole('button', { name: /Llama 3.1 8B/ }).click();
  await expect(page.getByRole('button', { name: /Llama 3.1 8B/ })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('.aura-root')).toHaveClass(/aura-light/);
  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByRole('heading', { name: 'AI settings' })).toBeVisible();
  await page.getByLabel('Assistant style').selectOption('developer');
});

test('ai saas: clearly states the provider credential stays server-side', async ({ page }) => {
  await page.goto(preview('ai-saas-chatbot'));
  await page.getByRole('button', { name: 'Open settings' }).click();
  const body = await page.locator('.aura-settings').innerText();
  expect(body).toMatch(/server-side key protection/i);
  expect(body).toMatch(/never sent to this browser/i);
  expect(body).not.toMatch(/gsk_[a-z0-9]{16,}/i);
});

test('web game: the loop runs, scores, and persists a best score', async ({ page }) => {
  await page.goto(preview('playable-web-game'));

  await expect(page.getByRole('heading', { name: 'Driftline', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: /start game/i }).click();

  // Score must actually climb while the loop runs.
  const score = page.locator('.dl-hud-item').first().locator('.dl-hud-value');
  await expect.poll(async () => Number(await score.innerText()), { timeout: 8000 }).toBeGreaterThan(0);

  // Pause genuinely freezes the score. Scoped to the control bar, because the
  // pause overlay renders its own Resume button too.
  const controls = page.locator('.dl-controls');
  await controls.getByRole('button', { name: 'Pause' }).click();
  const paused = Number(await score.innerText());
  await page.waitForTimeout(900);
  expect(Number(await score.innerText())).toBe(paused);

  await controls.getByRole('button', { name: 'Resume' }).click();
  await expect.poll(async () => Number(await score.innerText()), { timeout: 6000 }).toBeGreaterThan(paused);

  // Crashing writes a best score that survives a reload.
  await page.evaluate(() => window.localStorage.setItem('xroga_showcase_game_best_v1', '4242'));
  await page.reload();
  await expect(page.locator('.dl-hud-value--best')).toHaveText('4242');
});

test('no product states a fabricated customer, revenue, rating or download figure', async ({ page }) => {
  const patterns = [
    /\d[\d,.]*\s*\+?\s*(customers|active users|downloads|installs|reviews)\b/i,
    /\$\s?\d[\d,.]*\s*(m|k|million|billion)?\s*(in\s+)?(revenue|arr|mrr)\b/i,
    /\b\d(\.\d)?\s*(\/|out of)\s*5\b/i,
    /\btrusted by\s+\d/i,
    /\b\d[\d,.]*\s*(happy|satisfied)\s+(customers|clients)\b/i,
  ];
  for (const slug of ALL) {
    await page.goto(preview(slug));
    const body = await page.locator('body').innerText();
    for (const pattern of patterns) {
      expect(body, `${slug} matched ${pattern}`).not.toMatch(pattern);
    }
  }
});

test('no product names internal tooling or a model provider', async ({ page }) => {
  for (const slug of ALL) {
    await page.goto(preview(slug));
    const body = (await page.locator('body').innerText()).toLowerCase();
    for (const term of ['claude', 'anthropic', 'openai', 'gpt-4', 'gemini']) {
      expect(body, `${slug} mentions ${term}`).not.toContain(term);
    }
  }
});

test('every product fits a 390px viewport without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const slug of ALL) {
    await page.goto(preview(slug));
    await page.waitForTimeout(200);
    const layout = await page.evaluate(() => ({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.scrollWidth, slug).toBeLessThanOrEqual(layout.width + 1);
  }
});
