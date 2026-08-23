import { expect, test } from '@playwright/test';

/**
 * Selecting a costume used to appear to do nothing: only the wardrobe preview passed
 * a portrait, and every other surface fell back to a CSS sprite that carried
 * `data-costume` but had no per-costume artwork. These pin the fix.
 */

const SKINS = ['techwear', 'mystic-robe', 'circuit', 'ninja-neon'] as const;

/** The retired skin, still sitting in the storage of anyone who never changed it. */
const RETIRED_SKIN = 'coder';

async function seedCostume(page: import('@playwright/test').Page, costume: string, version = 4) {
  await page.addInitScript(([value, storedVersion]) => {
    window.localStorage.setItem(
      'xroga-companion',
      JSON.stringify({
        state: { costume: value, visible: true, name: 'Smoky', accent: 'blue', size: 'standard', dock: 'composer' },
        version: storedVersion,
      }),
    );
  }, [costume, version] as const);
}

test('the rendered companion uses the selected skin', async ({ page }) => {
  for (const skin of SKINS) {
    await seedCostume(page, skin);
    await page.goto('/');
    const image = page.locator('img.xv-companion-renderer').first();
    await expect(image, skin).toHaveAttribute('src', new RegExp(`${skin}\.webp$`));
  }
});

test('every skin asset actually resolves', async ({ request }) => {
  for (const skin of SKINS) {
    const response = await request.get(`/brand/costumes/${skin}.webp`);
    expect(response.status(), skin).toBe(200);
    expect(response.headers()['content-type'], skin).toContain('image/webp');
  }
});

/**
 * The retired skin, seeded exactly as a real browser would still be holding it.
 *
 * `coder` was the original default, so this is the stored value for every account
 * that never opened the wardrobe — the common case, not an edge case. Its artwork is
 * deleted, so without the migration the companion renders a broken image on every
 * surface at once. Seeded at version 4 because that is the version those browsers
 * actually wrote; the bump to 5 is what makes the migration run at all.
 */
test('a browser still holding the retired skin gets a costume that exists', async ({ page }) => {
  await seedCostume(page, RETIRED_SKIN, 4);
  await page.goto('/');
  const image = page.locator('img.xv-companion-renderer').first();
  await expect(image).not.toHaveAttribute('src', /coder\.webp$/);
  await expect(image).toHaveAttribute('src', new RegExp(`(${SKINS.join('|')})\\.webp$`));

  // And the artwork is genuinely gone, rather than merely unreferenced.
  const response = await page.request.get(`/brand/costumes/${RETIRED_SKIN}.webp`);
  expect(response.status()).toBe(404);
});

/**
 * Smoky is interactive again, but only for usage.
 *
 * The old control panel — voice toggles, a status readout, dictation, a feed control
 * — stays removed; that is what made the click intrusive. Clicking now opens exactly
 * one thing, so this asserts both halves: usage opens, and the panel has not returned.
 */
test('clicking Smoky opens usage, and not the old control panel', async ({ page }) => {
  await page.goto('/');

  const trigger = page.getByRole('button', { name: /show usage/i }).first();
  await expect(trigger).toBeVisible();

  // Interactive artwork must be reachable, not hidden from assistive technology.
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  await trigger.click();
  await expect(page.getByRole('dialog', { name: /usage/i })).toBeVisible();

  // The removed panel and its controls must not come back with it.
  await expect(page.getByRole('region', { name: /companion panel/i })).toHaveCount(0);
  await expect(page.getByRole('switch', { name: /voice/i })).toHaveCount(0);

  // Escape closes it.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /usage/i })).toHaveCount(0);
});

test('Smoky never speaks: no speech synthesis is invoked', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __spoke: boolean }).__spoke = false;
    const proto = window.speechSynthesis?.constructor?.prototype;
    if (proto) {
      const original = proto.speak;
      proto.speak = function patched(this: SpeechSynthesis, utterance: SpeechSynthesisUtterance) {
        (window as unknown as { __spoke: boolean }).__spoke = true;
        return original.call(this, utterance);
      };
    }
  });
  await page.goto('/');
  await page.waitForTimeout(1500);
  const spoke = await page.evaluate(() => (window as unknown as { __spoke: boolean }).__spoke);
  expect(spoke, 'Smoky invoked speech synthesis').toBe(false);
});

test('the pose loop is disabled under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const animation = await page.locator('img.xv-companion-renderer').first().evaluate(
    (el) => getComputedStyle(el).animationName,
  );
  expect(animation === 'none' || animation === '').toBe(true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
});
