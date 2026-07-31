import { expect, test } from '@playwright/test';

const LIVE_SLUG = 'modern-business-website';
const ALL_SLUGS = [
  'modern-business-website',
  'real-estate-platform',
  'booking-platform',
  'android-app',
  'ai-saas-chatbot',
  'playable-web-game',
];

test('the showcase index is reachable without signing in', async ({ page }) => {
  const response = await page.goto('/showcase');
  expect(response?.status()).toBe(200);
  // The middleware redirects non-public paths to /auth/login; landing here proves
  // /showcase is on the public allow-list.
  expect(new URL(page.url()).pathname).toBe('/showcase');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('all six products are listed with a details link each', async ({ page }) => {
  await page.goto('/showcase');
  for (const slug of ALL_SLUGS) {
    await expect(page.locator(`a[href="/showcase/${slug}"]`).first()).toBeVisible();
  }
});

test('every detail page renders and is publicly reachable', async ({ page }) => {
  for (const slug of ALL_SLUGS) {
    const response = await page.goto(`/showcase/${slug}`);
    expect(response?.status(), slug).toBe(200);
    expect(new URL(page.url()).pathname, slug).toBe(`/showcase/${slug}`);
    await expect(page.getByRole('heading', { level: 1 }), slug).toBeVisible();
  }
});

/**
 * Asserts on rendered content, not the HTTP status. Every dynamic route in this app
 * currently answers a miss with 200 plus the not-found body (`/docs/x`,
 * `/features/x` and `/community/<unknown-uuid>` all behave the same way), so a
 * status assertion here would be testing an app-wide soft-404 rather than the
 * showcase.
 */
test('an unknown slug renders the not-found page rather than an empty shell', async ({ page }) => {
  await page.goto('/showcase/does-not-exist');
  await expect(page.getByRole('heading', { name: /that build was not found/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /back to the showcase/i })).toBeVisible();
});

test('the live product preview renders a working interactive site', async ({ page }) => {
  const response = await page.goto(`/showcase/${LIVE_SLUG}/preview`);
  expect(response?.status()).toBe(200);

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation').first()).toBeVisible();

  // The FAQ accordion is real behaviour, not a static list. The first entry is open
  // by design, so drive a different one through a full closed → open → closed cycle.
  const faq = page.getByRole('button', { name: /do you work with existing codebases/i });
  await faq.scrollIntoViewIfNeeded();
  await expect(faq).toHaveAttribute('aria-expanded', 'false');
  await faq.click();
  await expect(faq).toHaveAttribute('aria-expanded', 'true');

  // Opening one entry must close the one that was open.
  const first = page.getByRole('button', { name: /how quickly can you start/i });
  await expect(first).toHaveAttribute('aria-expanded', 'false');
});

test('the preview contact form validates instead of silently accepting', async ({ page }) => {
  await page.goto(`/showcase/${LIVE_SLUG}/preview`);
  const submit = page.getByRole('button', { name: /send|submit|enquir/i }).last();
  await submit.scrollIntoViewIfNeeded();
  await submit.click();
  // An empty submit must surface an error, not a success state.
  await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
});

test('previews are excluded from search indexing', async ({ page }) => {
  await page.goto(`/showcase/${LIVE_SLUG}/preview`);
  const robots = await page.locator('meta[name="robots"]').first().getAttribute('content');
  expect(robots).toMatch(/noindex/i);
});

test('products still in development do not offer a preview that renders nothing', async ({ page }) => {
  await page.goto('/showcase/real-estate-platform/preview');
  // A template with no renderer must land on not-found, never an empty frame.
  await expect(page.getByRole('heading', { name: /that build was not found/i })).toBeVisible();
});

test('sample content is labelled and no fabricated metrics are shown', async ({ page }) => {
  await page.goto(`/showcase/${LIVE_SLUG}/preview`);
  const body = (await page.locator('body').innerText()).toLowerCase();

  // Testimonials are sample copy and must say so.
  expect(body).toContain('sample');

  // Nothing may assert customer counts, revenue, downloads or ratings.
  for (const pattern of [
    /\d[\d,.]*\s*\+?\s*(customers|users|downloads|installs|reviews)\b/,
    /\$\s?\d[\d,.]*\s*(m|k|million|billion)?\s*(revenue|arr|mrr)\b/,
    /\b\d(\.\d)?\s*(\/|out of)\s*5\s*(stars|rating)?\b/,
  ]) {
    expect(body, `fabricated metric matched ${pattern}`).not.toMatch(pattern);
  }
});

test('the showcase never claims a shipped mobile release', async ({ page }) => {
  await page.goto('/showcase/android-app');
  const body = (await page.locator('body').innerText()).toLowerCase();
  for (const claim of ['available on google play', 'download the apk', 'get it on google play', 'now on the play store']) {
    expect(body, claim).not.toContain(claim);
  }
});

test('the public showcase does not name internal tooling', async ({ page }) => {
  for (const path of ['/showcase', `/showcase/${LIVE_SLUG}`]) {
    await page.goto(path);
    const body = (await page.locator('body').innerText()).toLowerCase();
    for (const term of ['claude', 'anthropic', 'openai', 'gpt-']) {
      expect(body, `${path} mentions ${term}`).not.toContain(term);
    }
  }
});

test('customizing prompts for an account instead of exposing a build to anonymous users', async ({ page }) => {
  await page.goto(`/showcase/${LIVE_SLUG}`);

  // The header button scrolls to the start section by design; the card inside that
  // section is what opens the guided flow.
  const startSection = page.locator('#showcase-start');
  await startSection.scrollIntoViewIfNeeded();
  await page.locator('section', { has: startSection }).getByRole('button', { name: /customize for me/i }).first().click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /^continue$/i }).click();

  // The review step shows the exact prompt, editable, before anything runs.
  const prompt = dialog.locator('textarea');
  await expect(prompt).toBeVisible();
  expect((await prompt.inputValue()).length).toBeGreaterThan(20);

  await dialog.getByRole('button', { name: /start building/i }).click();
  // A signed-out user must be routed to sign-up, not have a project created.
  await page.waitForURL(/\/auth\/(signup|login)/, { timeout: 20_000 });
});

test('the showcase index has no horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/showcase', `/showcase/${LIVE_SLUG}`, `/showcase/${LIVE_SLUG}/preview`]) {
    await page.goto(path);
    const layout = await page.evaluate(() => ({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.scrollWidth, path).toBeLessThanOrEqual(layout.width + 1);
  }
});

test('the homepage links into the showcase', async ({ page }) => {
  await page.goto('/');
  const link = page.locator('a[href="/showcase"]').first();
  await link.scrollIntoViewIfNeeded();
  await expect(link).toBeVisible();
});

test('showcase detail pages are in the sitemap and previews are not', async ({ request }) => {
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const paths = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) =>
    new URL(match[1].trim()).pathname.replace(/\/$/, ''),
  );

  expect(paths).toContain('/showcase');
  for (const slug of ALL_SLUGS) {
    expect(paths, slug).toContain(`/showcase/${slug}`);
  }
  expect(paths.filter((path) => path.endsWith('/preview'))).toEqual([]);
});
