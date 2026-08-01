import { expect, test } from '@playwright/test';

/**
 * Selecting a costume used to appear to do nothing: only the wardrobe preview passed
 * a portrait, and every other surface fell back to a CSS sprite that carried
 * `data-costume` but had no per-costume artwork. These pin the fix.
 */

const SKINS = ['coder', 'techwear', 'mystic-robe', 'circuit', 'ninja-neon'] as const;

async function seedCostume(page: import('@playwright/test').Page, costume: string) {
  await page.addInitScript((value) => {
    window.localStorage.setItem(
      'xroga-companion',
      JSON.stringify({
        state: { costume: value, visible: true, name: 'Smoky', accent: 'blue', size: 'standard', dock: 'composer' },
        version: 4,
      }),
    );
  }, costume);
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
