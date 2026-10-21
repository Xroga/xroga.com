import { test, expect } from '@playwright/test';

// Uses genuine rendered conversation messages with deterministic local guest replies.
// No production credentials, real model calls, or authenticated-user impersonation.
test.use({ viewport: { width: 1366, height: 768 }, bypassCSP: true });

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
    throw new Error('Conversation-rail interaction fixture must run against a local frontend.');
  }
  let reply = 0;
  await page.route('**/api/guest/chat', route => {
    reply++;
    const details = Array.from({ length: 10 }, (_, index) =>
      'Verified answer paragraph ' + (index + 1) + ' for response ' + reply +
      ': these are deterministic local guest test messages, not model-generated statements.'
    ).join('\n\n');
    return route.fulfill({
      status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        response: 'Answer marker ' + reply + '\n\n' + details,
        guestSessionId: 'rail-ui-fixture',
        guest: { limit: 10, remaining: Math.max(0, 10 - reply), resetAt: '2099-01-01T00:00:00Z' },
      }),
    });
  });
});

async function populate(page: import('@playwright/test').Page) {
  await page.goto('/workspace');
  for (let index = 1; index <= 4; index++) {
    const prompt = 'Conversation rail prompt ' + index + ': inspect the real message flow and navigation.';
    await page.locator('[data-terminal-composer]').fill(prompt);
    await page.getByRole('button', { name: 'Send prompt', exact: true }).click();
    await expect(page.getByText('Answer marker ' + index, { exact: false }).first()).toBeVisible();
  }
  const rail = page.getByRole('navigation', { name: 'Conversation turn navigation' });
  await expect(rail).toBeVisible();
  await expect(rail.locator('.xv-chat-turn-tick')).toHaveCount(8);
  return rail;
}

test('dash geometry, proximity hover, actual preview, bookmark and jump', async ({ page }) => {
  const rail = await populate(page);
  const dashes = rail.locator('.xv-chat-turn-tick');
  await page.screenshot({ path: 'test-results/rail-default.png' });
  await dashes.nth(2).hover();
  await expect(rail.locator('.xv-chat-turn-preview')).toContainText('Conversation rail prompt 2');
  await expect(rail.locator('.xv-chat-turn-preview')).toContainText('Answer marker 2');
  // Wait until the 185 ms proximity interpolation settles before measuring geometry.
  await page.waitForTimeout(240);
  const widths = await dashes.evaluateAll(elements =>
    elements.slice(0, 7).map(element => parseFloat(getComputedStyle(element.firstElementChild!).width))
  );
  expect(widths[2]).toBeGreaterThanOrEqual(28);
  expect(widths[1]).toBeGreaterThanOrEqual(18);
  expect(widths[3]).toBeGreaterThanOrEqual(18);
  expect(widths[0]).toBeGreaterThanOrEqual(12);
  await page.screenshot({ path: 'test-results/rail-hover.png' });
  await rail.locator('.xv-chat-turn-preview').hover();
  await expect(rail.locator('.xv-chat-turn-preview')).toBeVisible();
  await rail.getByRole('button', { name: 'Bookmark this message' }).click();
  await expect(rail.locator('.xv-chat-turn-tick--bookmarked')).toHaveCount(1);
  await expect(rail.getByRole('button', { name: 'Remove bookmark' })).toBeVisible();
  await page.screenshot({ path: 'test-results/rail-bookmark.png' });

  const saved = rail.locator('.xv-chat-turn-tick--bookmarked');
  await saved.click();
  await expect.poll(async () =>
    page.locator('[data-turn-id]').filter({ hasText: 'Conversation rail prompt 2' })
      .first().evaluate(el => Math.round(el.getBoundingClientRect().top))
  ).toBeLessThan(320);
  await saved.hover();
  await rail.getByRole('button', { name: 'Remove bookmark' }).click();
  await expect(rail.locator('.xv-chat-turn-tick--bookmarked')).toHaveCount(0);
});

test('active reading marker follows both scroll directions and no rail appears for empty work', async ({ page }) => {
  await page.goto('/workspace');
  await expect(page.locator('.xv-chat-turn-rail')).toHaveCount(0);
  const rail = await populate(page);
  const root = page.locator('.xv-terminal-scroll').first();
  await root.evaluate(element => element.scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(async () => rail.locator('.xv-chat-turn-tick--active').count()).toBe(1);
  const topActive = await rail.locator('.xv-chat-turn-tick--active').getAttribute('aria-label');
  await root.evaluate(element => element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }));
  await expect.poll(async () => rail.locator('.xv-chat-turn-tick--active').getAttribute('aria-label'))
    .not.toBe(topActive);
  await root.evaluate(element => element.scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(async () => rail.locator('.xv-chat-turn-tick--active').getAttribute('aria-label'))
    .toBe(topActive);
});
