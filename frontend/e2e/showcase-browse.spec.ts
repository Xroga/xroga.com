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

test('every card in the catalogue shows a live preview of its product', async ({ page }) => {
  await page.goto('/showcase');
  await page.locator('#showcase-browse-heading').scrollIntoViewIfNeeded();

  // One spotlight frame plus one per card.
  await expect.poll(async () => page.locator('iframe').count(), { timeout: 20_000 }).toBe(7);

  const headings: string[] = [];
  for (let index = 0; index < 7; index += 1) {
    const text = await page
      .frameLocator('iframe')
      .nth(index)
      .locator('h1')
      .first()
      .innerText({ timeout: 12_000 })
      .catch(() => '');
    if (text) headings.push(text);
  }
  expect(headings.length, 'every frame should render its product').toBe(7);
});

test('homepage cards show live previews and stay link-only', async ({ page }) => {
  await page.goto('/');
  await page.locator('#showcase-home-heading').scrollIntoViewIfNeeded();

  await expect.poll(async () => page.locator('iframe').count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(6);
  await expect(page.frameLocator('iframe').first().getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });

  // A marketing section must not offer an action that turns into an auth wall.
  const section = page.locator('#showcase-home-heading').locator('..');
  await expect(section.getByRole('button', { name: /customize for me/i })).toHaveCount(0);
  await expect(section.getByRole('link', { name: /details/i }).first()).toBeVisible();
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
