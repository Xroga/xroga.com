import { expect, test } from '@playwright/test';

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'wide', width: 1920, height: 1080 },
];

for (const viewport of viewports) {
  test(`public launch shell is usable at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /pricing/i }).first()).toBeVisible();
    const layout = await page.evaluate(() => ({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      language: document.documentElement.lang,
      title: document.title,
      unnamedInteractiveElements: [...document.querySelectorAll('button, a[href]')].filter((element) => {
        const label = element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent?.trim();
        return !label;
      }).length,
      imagesMissingAlt: [...document.querySelectorAll('img')].filter((image) => !image.hasAttribute('alt')).length,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width + 1);
    expect(layout.language).toBeTruthy();
    expect(layout.title).toMatch(/Xroga/i);
    expect(layout.unnamedInteractiveElements).toBe(0);
    expect(layout.imagesMissingAlt).toBe(0);
  });
}

test('public metadata excludes private application routes and security headers are active', async ({ request }) => {
  const home = await request.get('/');
  expect(home.status()).toBe(200);
  const headers = home.headers();
  const hstsMaxAge = Number(headers['strict-transport-security']?.match(/max-age=(\d+)/i)?.[1] ?? 0);
  expect(hstsMaxAge).toBeGreaterThanOrEqual(31_536_000);
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['permissions-policy']).toContain('microphone=(self)');

  const robots = await request.get('/robots.txt');
  const robotsText = await robots.text();
  expect(robots.status()).toBe(200);
  expect(robotsText).toMatch(/Disallow: \/dashboard\//);
  expect(robotsText).toMatch(/Disallow: \/workspace/);

  const sitemap = await request.get('/sitemap.xml');
  const sitemapText = await sitemap.text();
  expect(sitemap.status()).toBe(200);
  // Compare whole <loc> paths, not substrings: the sitemap legitimately lists public
  // docs pages such as /docs/workspace, which a bare `not.toContain('/workspace')`
  // flags as a private-route leak.
  const sitemapPaths = [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => new URL(match[1].trim()).pathname.replace(/\/$/, ''),
  );
  expect(sitemapPaths.length).toBeGreaterThan(0);
  for (const privatePath of ['/workspace', '/settings']) {
    expect(sitemapPaths).not.toContain(privatePath);
  }
  expect(sitemapPaths.filter((path) => path.startsWith('/dashboard'))).toEqual([]);
});
