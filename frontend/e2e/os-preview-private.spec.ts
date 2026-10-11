import { expect, test } from '@playwright/test';

test('signed-out visitors cannot read any OS preview page or its RSC payload', async ({ request }) => {
  for (const path of ['/os-preview', '/os-preview/journey', '/os-preview/browser', '/os-preview/rich-results', '/os-preview/founder']) {
    const response = await request.get(path, { maxRedirects: 5 });
    const body = await response.text();
    expect(response.url(), path).toMatch(/\/auth\/login(?:\?|$)|\/os-preview(?:\/|$)/);
    if (new URL(response.url()).pathname.startsWith('/os-preview')) expect(response.status(), path).toBe(404);
    expect(body, path).not.toContain('From an outcome to a clear result');
    expect(body, path).not.toContain('Scenario & Error Lab');
    expect(body, path).not.toContain('Answers worth exploring');
    const rsc = await request.get(path, { headers: { RSC: '1', Accept: 'text/x-component' }, maxRedirects: 5 });
    const rscBody = await rsc.text();
    if (new URL(rsc.url()).pathname.startsWith('/os-preview')) expect(rsc.status(), `${path} RSC`).toBe(404);
    expect(rscBody, `${path} RSC`).not.toContain('Scenario & Error Lab');
    expect(rscBody, `${path} RSC`).not.toContain('Answers worth exploring');
  }
});

test('public marketing no longer advertises the founder-only preview', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('a[href="/os-preview"]')).toHaveCount(0);
});
