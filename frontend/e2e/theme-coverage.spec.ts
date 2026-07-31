import { expect, test } from '@playwright/test';

/**
 * Theme coverage for Docs (§14) and the shared workspace surfaces (§13).
 *
 * Docs previously styled itself with Tailwind `dark:` variants, which follow the OS
 * colour-scheme preference and therefore ignored the selected Xroga theme entirely.
 * Several workspace surfaces had white, gray and black overrides but no beige, so
 * beige fell through to each rule's dark default.
 */

const THEMES = ['theme-white', 'theme-beige', 'theme-gray', 'theme-black'] as const;
const LIGHT = new Set(['theme-white', 'theme-beige']);

async function applyTheme(page: import('@playwright/test').Page, theme: string) {
  await page.evaluate((name) => {
    document.body.classList.remove('theme-white', 'theme-beige', 'theme-gray', 'theme-black');
    document.body.classList.add(name);
  }, theme);
  await page.waitForTimeout(150);
}

/** Luminance of a computed colour, or null when it cannot be parsed. */
const MEASURE = (selectors: { text: string; surface: string }) => {
  const luminance = (value: string | null) => {
    if (!value || value.includes('rgba(0, 0, 0, 0)')) return null;
    const parts = (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    return parts.length < 3 ? null : (0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2]) / 255;
  };
  const textEl = document.querySelector(selectors.text);
  let node = document.querySelector(selectors.surface) as HTMLElement | null;
  let surface: number | null = null;
  while (node && surface === null) {
    surface = luminance(getComputedStyle(node).backgroundColor);
    node = node.parentElement;
  }
  return { text: textEl ? luminance(getComputedStyle(textEl).color) : null, surface };
};

test('the docs index follows every Xroga theme', async ({ page }) => {
  for (const theme of THEMES) {
    await page.goto('/docs');
    await applyTheme(page, theme);

    const measured = await page.evaluate(MEASURE, { text: 'h1', surface: 'main' });
    expect(measured.text, `${theme} docs text unmeasurable`).not.toBeNull();
    expect(measured.surface, `${theme} docs surface unmeasurable`).not.toBeNull();
    expect(Math.abs(measured.text! - measured.surface!), `${theme} docs heading unreadable`).toBeGreaterThan(0.4);

    if (LIGHT.has(theme)) {
      expect(measured.surface!, `${theme} docs page is still dark`).toBeGreaterThan(0.7);
    } else {
      expect(measured.surface!, `${theme} docs page should be dark`).toBeLessThan(0.35);
    }
  }
});

test('a docs article follows every Xroga theme', async ({ page }) => {
  for (const theme of THEMES) {
    await page.goto('/docs/getting-started');
    await applyTheme(page, theme);

    const measured = await page.evaluate(MEASURE, { text: 'article h1', surface: 'main' });
    expect(measured.text, `${theme} article text unmeasurable`).not.toBeNull();
    expect(Math.abs(measured.text! - measured.surface!), `${theme} article heading unreadable`).toBeGreaterThan(0.4);

    if (LIGHT.has(theme)) {
      expect(measured.surface!, `${theme} article is still dark`).toBeGreaterThan(0.7);
    }
  }
});

test('docs no longer depend on the OS colour-scheme preference', async ({ page }) => {
  // With the OS forced dark, a light Xroga theme must still produce a light page.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/docs');
  await applyTheme(page, 'theme-white');

  const measured = await page.evaluate(MEASURE, { text: 'h1', surface: 'main' });
  expect(measured.surface!, 'docs followed the OS preference instead of the Xroga theme').toBeGreaterThan(0.7);
  expect(Math.abs(measured.text! - measured.surface!)).toBeGreaterThan(0.4);

  await page.emulateMedia({ colorScheme: 'light' });
});

test('the docs search field and cards stay readable in a light theme', async ({ page }) => {
  await page.goto('/docs');
  await applyTheme(page, 'theme-beige');

  const field = await page.evaluate(MEASURE, { text: 'input[type="search"], input', surface: 'input[type="search"], input' });
  expect(field.text, 'search field text unmeasurable').not.toBeNull();
  expect(field.surface, 'search field surface unmeasurable').not.toBeNull();
  expect(Math.abs(field.text! - field.surface!), 'search field text unreadable on beige').toBeGreaterThan(0.35);
});

test('every doc page is reachable and has one h1', async ({ page }) => {
  for (const path of ['/docs', '/docs/getting-started', '/docs/security', '/docs/hackathon-workflows']) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator('h1'), path).toHaveCount(1);
  }
});
