import { expect, test } from '@playwright/test';

/**
 * Covers the /crypto-hackathon-builder → /crypto-builder migration.
 *
 * The old URL must permanently redirect and must not render a second copy of the
 * page, and every public surface that referenced it must point at the new route.
 */

const OLD = '/crypto-hackathon-builder';
const NEW = '/crypto-builder';

test('the new route serves the page', async ({ page }) => {
  const response = await page.goto(NEW);
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe(NEW);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('the old route permanently redirects and renders no duplicate page', async ({ page, request }) => {
  // A 308 is Next's permanent redirect for a GET.
  const raw = await request.get(OLD, { maxRedirects: 0 });
  expect([301, 308]).toContain(raw.status());
  expect(raw.headers()['location']).toContain(NEW);

  // Following it lands on the new URL, not a second copy at the old one.
  await page.goto(OLD);
  expect(new URL(page.url()).pathname).toBe(NEW);
});

test('the canonical URL points at the new route', async ({ page }) => {
  await page.goto(NEW);
  const canonical = await page.locator('link[rel="canonical"]').first().getAttribute('href');
  expect(canonical).toBe(`https://xroga.com${NEW}`);

  // Open Graph must agree with the canonical.
  const ogUrl = await page.locator('meta[property="og:url"]').first().getAttribute('content');
  if (ogUrl) expect(ogUrl).toContain(NEW);
});

test('the page is titled and positioned as Crypto Builder, not hackathon-only', async ({ page }) => {
  await page.goto(NEW);
  await expect(page).toHaveTitle(/Crypto Builder/i);

  const title = await page.title();
  expect(title).not.toMatch(/Crypto Hackathon Builder/i);

  // The layout emits a site-wide block too, so check across all of them: one must
  // carry the new route, and none may still carry the old one.
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(blocks.length).toBeGreaterThan(0);
  expect(blocks.some((block) => block.includes(NEW))).toBe(true);
  expect(blocks.some((block) => block.includes('crypto-hackathon-builder'))).toBe(false);
});

test('sitemap lists the new route and not the old one', async ({ request }) => {
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const paths = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) =>
    new URL(match[1].trim()).pathname.replace(/\/$/, ''),
  );
  expect(paths).toContain(NEW);
  expect(paths).not.toContain(OLD);
});

test('llms.txt references the new route only', async ({ request }) => {
  const response = await request.get('/llms.txt');
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain(NEW);
  expect(body).not.toContain('crypto-hackathon-builder');
});

test('the homepage footer links to Crypto Builder', async ({ page }) => {
  await page.goto('/');
  const link = page.locator(`a[href="${NEW}"]`).first();
  await link.scrollIntoViewIfNeeded();
  await expect(link).toBeVisible();
  await expect(link).toHaveText(/crypto builder/i);
  await expect(page.locator(`a[href="${OLD}"]`)).toHaveCount(0);
});

test('no public page still links to the old route', async ({ page }) => {
  for (const path of ['/', '/features', '/docs', '/ai-coding-agent', NEW]) {
    await page.goto(path);
    await expect(page.locator(`a[href*="crypto-hackathon-builder"]`), path).toHaveCount(0);
  }
});

/* ------------------------------------------------------- homepage hero changes */

test('the hero no longer carries Share Feedback or Community, and both still work', async ({ page }) => {
  await page.goto('/');

  const hero = page.locator('.xv-hc-hero');
  await expect(hero.getByRole('button', { name: /share feedback/i })).toHaveCount(0);
  await expect(hero.getByRole('link', { name: /^community$/i })).toHaveCount(0);

  // Community moved to its own section further down.
  const support = page.locator('#community-support-heading').locator('..');
  await expect(support.getByRole('link', { name: /open community/i })).toBeVisible();

  // Share Feedback still opens the existing modal.
  await support.getByRole('button', { name: /share feedback/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('removing the hero buttons left no empty gap', async ({ page }) => {
  await page.goto('/');
  // The CTA row must still contain its remaining actions and have real height.
  const ctas = page.locator('.xv-hc-hero .xv-hc-ctas').first();
  await expect(ctas).toBeVisible();
  const box = await ctas.boundingBox();
  expect(box!.height).toBeGreaterThan(20);
  const children = await ctas.locator('> *').count();
  expect(children).toBeGreaterThanOrEqual(2);
});
