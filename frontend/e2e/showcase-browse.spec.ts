import { expect, test } from '@playwright/test';

/**
 * Covers the browse surface added to /showcase and the homepage cards.
 *
 * The point of these is that the controls are not decorative: the visible count and
 * the rendered cards must actually follow the search, filters and sort.
 */

const count = (page: import('@playwright/test').Page) => page.locator('#showcase-browse-heading').locator('..').locator('[role=status]').first();

test('the spotlight runs the real product, interactively', async ({ page }) => {
  await page.goto('/showcase');
  const frame = page.frameLocator('iframe').first();

  await expect(frame.getByRole('heading', { level: 1 })).toContainText(/digital products/i);

  // Interactive means interactive: the product's own FAQ responds inside the frame.
  const faq = frame.getByRole('button', { name: /do you work with existing codebases/i });
  await faq.scrollIntoViewIfNeeded();
  await expect(faq).toHaveAttribute('aria-expanded', 'false');
  await faq.click();
  await expect(faq).toHaveAttribute('aria-expanded', 'true');
});

test('the product switcher changes which product is previewed', async ({ page }) => {
  await page.goto('/showcase');
  await expect(page.frameLocator('iframe').first().getByRole('heading', { level: 1 })).toContainText(/digital products/i);

  await page.getByRole('tab', { name: 'Playable Web Game' }).click();
  await expect(page.frameLocator('iframe').first().getByRole('heading', { level: 1 })).toContainText('Driftline');
});

test('the device switcher renders the product at a genuinely narrower viewport', async ({ page }) => {
  await page.goto('/showcase');

  const desktop = await page.locator('iframe').first().boundingBox();
  expect(desktop!.width).toBeGreaterThan(700);

  await page.getByRole('radio', { name: 'Mobile' }).click();
  await expect.poll(async () => (await page.locator('iframe').first().boundingBox())!.width).toBeLessThan(500);

  // At mobile width the product's own mobile navigation appears — proof it is a real
  // viewport change rather than a scaled-down desktop layout.
  await expect(page.frameLocator('iframe').first().getByRole('button', { name: /open menu/i })).toBeVisible();
});

test('search filters the catalogue by capability, not just by name', async ({ page }) => {
  await page.goto('/showcase');
  await expect(count(page)).toContainText('Showing 6 of 6');

  // "mortgage" appears in a capability, not in any product name.
  await page.locator('input[type=search]').fill('mortgage');
  await expect(count(page)).toContainText('Showing 1 of 6');
  await expect(page.getByRole('heading', { name: 'Real Estate Platform', level: 3 })).toBeVisible();

  await page.locator('input[type=search]').fill('zzzz-no-match');
  await expect(count(page)).toContainText('Showing 0 of 6');
  await expect(page.getByRole('heading', { name: /nothing matches those filters/i })).toBeVisible();
});

test('category and technology filters narrow the results and clear together', async ({ page }) => {
  await page.goto('/showcase');

  await page.getByRole('button', { name: 'Game', exact: true }).click();
  await expect(count(page)).toContainText('Showing 1 of 6');

  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(count(page)).toContainText('Showing 6 of 6');

  await page.getByLabel('Technology').selectOption('Expo');
  await expect(count(page)).toContainText('Showing 1 of 6');

  await page.getByRole('button', { name: /clear 1 filter/i }).click();
  await expect(count(page)).toContainText('Showing 6 of 6');
});

test('sorting reorders the rendered cards', async ({ page }) => {
  await page.goto('/showcase');
  await page.getByLabel('Sort').selectOption('name');
  const names = await page.locator('#showcase-browse-heading').locator('..').locator('article h3').allInnerTexts();
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
});

/**
 * Cards carry real captured screenshots rather than live frames, so a listing page
 * never boots six application runtimes. The one live frame on /showcase is the
 * spotlight, which is where a visitor has asked to try a product.
 */
test('every card shows a real product screenshot, with one live frame on the page', async ({ page }) => {
  await page.goto('/showcase');
  await page.locator('#showcase-browse-heading').scrollIntoViewIfNeeded();

  const catalogue = page.locator('section', { has: page.locator('#showcase-browse-heading') });
  const cards = catalogue.locator('article');
  await expect(cards).toHaveCount(6);
  await expect(cards.locator('img[src*="thumbnails"]')).toHaveCount(6);

  // Only the spotlight runs a product.
  await expect(page.locator('iframe')).toHaveCount(1);
  await expect(page.frameLocator('iframe').first().getByRole('heading', { level: 1 })).toBeVisible();
});

test('homepage cards carry screenshots and a working customize action', async ({ page }) => {
  await page.goto('/');
  await page.locator('#showcase-home-heading').scrollIntoViewIfNeeded();

  const section = page.locator('#showcase-home-heading').locator('..');
  await expect(section.locator('img[src*="thumbnails"]')).toHaveCount(6);
  await expect(page.locator('iframe')).toHaveCount(0);

  // Customizing is offered here and must open the real flow, not a placeholder.
  await section.getByRole('button', { name: /customize for me/i }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(page.locator('a[href="/showcase"]').last()).toBeVisible();
});

test('the browse surface has no horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/showcase', '/']) {
    await page.goto(path);
    await page.waitForTimeout(400);
    const layout = await page.evaluate(() => ({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.scrollWidth, path).toBeLessThanOrEqual(layout.width + 1);
  }
});
