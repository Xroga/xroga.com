import { expect, test } from '@playwright/test';

import { PENDING_PROMPT_KEY } from '../src/lib/constants';

/**
 * Covers the Crypto Builder page: its broader positioning, the functional prompt bar
 * and its persistence through authentication, the ecosystem disclaimers, and that the
 * page follows the selected Xroga theme rather than being hardcoded dark.
 */

const PAGE = '/crypto-builder';

test('the page is positioned as a broad crypto builder, not hackathons only', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // innerText returns *rendered* text, so CSS text-transform applies. Compare
  // case-insensitively rather than fighting the uppercase eyebrows.
  const body = (await page.locator('body').innerText()).toLowerCase();
  for (const kind of [
    'ai crypto agents',
    'web3 applications',
    'defi tools',
    'dao and governance tooling',
    'token and wallet utilities',
    'on-chain monitoring',
    'crypto analytics products',
    'hackathon projects',
  ]) {
    expect(body, `missing "${kind}"`).toContain(kind);
  }
  expect(body).toContain('not only hackathons');
});

test('the prompt bar is functional and preserves the prompt for the workspace', async ({ page }) => {
  await page.goto(PAGE);

  const input = page.getByRole('textbox', { name: /describe the crypto product/i });
  await expect(input).toBeVisible();

  await input.fill('Build a DeFi analytics dashboard for a lending protocol');
  await page.getByRole('button', { name: 'Launch' }).click();

  // Signed out, the prompt must be stashed and the user routed through signup.
  await page.waitForURL(/\/auth\/(signup|login)/, { timeout: 20_000 });
  const stored = await page.evaluate((key) => window.localStorage.getItem(key), PENDING_PROMPT_KEY);
  expect(stored).toBe('Build a DeFi analytics dashboard for a lending protocol');
});

test('an empty submission still carries crypto intent into the workspace', async ({ page }) => {
  await page.goto(PAGE);
  await page.getByRole('button', { name: 'Launch' }).click();
  await page.waitForURL(/\/auth\/(signup|login)/, { timeout: 20_000 });
  const stored = await page.evaluate((key) => window.localStorage.getItem(key), PENDING_PROMPT_KEY);
  expect(stored).toBe('Build a crypto product with Xroga AI');
});

test('a suggestion chip fills the input for review rather than submitting blind', async ({ page }) => {
  await page.goto(PAGE);
  const chip = page.getByRole('button', { name: 'Build an AI agent for crypto market research' });
  await chip.click();

  const input = page.getByRole('textbox', { name: /describe the crypto product/i });
  await expect(input).toHaveValue('Build an AI agent for crypto market research');
  // Still on the page: the user reviews before sending.
  expect(new URL(page.url()).pathname).toBe(PAGE);
});

test('Enter submits and Shift+Enter inserts a newline', async ({ page }) => {
  await page.goto(PAGE);
  const input = page.getByRole('textbox', { name: /describe the crypto product/i });

  await input.fill('first line');
  await input.press('Shift+Enter');
  await input.type('second line');
  await expect(input).toHaveValue('first line\nsecond line');
  expect(new URL(page.url()).pathname).toBe(PAGE);

  await input.press('Enter');
  await page.waitForURL(/\/auth\/(signup|login)/, { timeout: 20_000 });
});

test('the ecosystem section carries the non-affiliation disclaimer and no invented figures', async ({ page }) => {
  await page.goto(PAGE);
  const body = await page.locator('body').innerText();

  expect(body).toContain('Xroga is not affiliated with or endorsed by the organizations shown');
  expect(body).toContain('Check official event details');

  // None of the forbidden relationship claims.
  for (const claim of ['our partners', 'partner hackathons', 'official xroga partners', 'sponsored by', 'funded by']) {
    expect(body.toLowerCase(), `page claims "${claim}"`).not.toContain(claim);
  }

  // No invented prize or funding amount.
  expect(body).not.toMatch(/\$\s?\d[\d,.]*\s*(k|m|million)?\s*(prize|pool|grant|bounty)/i);
  expect(body).not.toMatch(/(prize pool|total prizes)[^.]{0,30}\$\s?\d/i);

  // No guarantees.
  for (const promise of ['guaranteed prize', 'you will win', 'guaranteed funding']) {
    expect(body.toLowerCase()).not.toContain(promise);
  }
});

test('every ecosystem card links to an official organiser page', async ({ page }) => {
  await page.goto(PAGE);
  const links = page.locator('.xv-cb-eco-card');
  const count = await links.count();
  expect(count).toBeGreaterThan(0);

  for (let index = 0; index < count; index += 1) {
    const href = await links.nth(index).getAttribute('href');
    expect(href, `card ${index}`).toMatch(/^https:\/\//);
    // External links must not leak the referrer-opener.
    expect(await links.nth(index).getAttribute('rel')).toContain('noopener');
  }
});

/**
 * The previous version of this page was hardcoded to a dark surface with white text,
 * so selecting White or Beige left it dark. This asserts the page actually follows
 * the selected theme.
 */
const THEMES = ['theme-white', 'theme-beige', 'theme-gray', 'theme-black'];

test('the page follows every Xroga theme with readable contrast', async ({ page }) => {
  for (const theme of THEMES) {
    await page.goto(PAGE);
    await page.evaluate((name) => {
      document.body.classList.remove('theme-white', 'theme-beige', 'theme-gray', 'theme-black');
      document.body.classList.add(name);
    }, theme);
    await page.waitForTimeout(150);

    const measured = await page.evaluate(() => {
      const luminance = (value: string) => {
        const parts = (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        return parts.length < 3 ? null : (0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2]) / 255;
      };
      const heading = document.querySelector('.xv-cb-h1');
      const root = document.querySelector('.xv-cb-root');
      if (!heading || !root) return null;
      return {
        text: luminance(getComputedStyle(heading).color),
        background: luminance(getComputedStyle(root).backgroundColor),
      };
    });

    expect(measured, `${theme} could not be measured`).not.toBeNull();
    const delta = Math.abs(measured!.text! - measured!.background!);
    expect(delta, `${theme} heading is not readable`).toBeGreaterThan(0.4);

    // A light theme must actually be light — the old page stayed dark regardless.
    if (theme === 'theme-white' || theme === 'theme-beige') {
      expect(measured!.background!, `${theme} background is still dark`).toBeGreaterThan(0.7);
    }
  }
});

test('the page has no horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PAGE);
  await page.waitForTimeout(250);
  const layout = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width + 1);

  // The prompt bar must remain usable at that width.
  const input = page.getByRole('textbox', { name: /describe the crypto product/i });
  await expect(input).toBeVisible();
  const box = await input.boundingBox();
  expect(box!.width).toBeGreaterThan(200);
});

test('the sidebar-facing route is publicly reachable without signing in', async ({ page }) => {
  const response = await page.goto(PAGE);
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe(PAGE);
});

/* ------------------------------------------------------- homepage theming (§12) */

/**
 * The homepage was a self-contained dark design system: its local `--hc-*` tokens
 * were fixed dark literals, so selecting White or Beige changed almost nothing. These
 * assert the page genuinely follows the selected theme.
 */
test('the homepage follows every Xroga theme instead of staying dark', async ({ page }) => {
  await page.goto('/');
  for (const theme of ['White', 'Beige', 'Gray', 'Black']) {
    await page.getByRole('button', { name: 'Change homepage theme' }).click();
    await page.getByRole('radio', { name: theme, exact: true }).click();
    await expect(page.locator('body')).toHaveClass(new RegExp(`theme-${theme.toLowerCase()}`));
    await page.waitForTimeout(600);

    const measured = await page.evaluate(() => {
      const luminance = (value: string | null) => {
        if (!value) return null;
        const parts = (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        return parts.length < 3 ? null : (0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2]) / 255;
      };
      const wrap = document.querySelector('.xv-home-coding');
      const read = (selector: string) => {
        const el = document.querySelector(selector);
        return el ? luminance(getComputedStyle(el).color) : null;
      };
      return {
        background: luminance(wrap ? getComputedStyle(wrap).backgroundColor : null),
        brand: read('.xv-hc-brand'),
        sub: read('.xv-hc-sub'),
      };
    });

    expect(measured.background, `${theme} background unmeasurable`).not.toBeNull();
    for (const [name, value] of Object.entries({ brand: measured.brand, sub: measured.sub })) {
      expect(value, `${theme} ${name} unmeasurable`).not.toBeNull();
      expect(Math.abs(value! - measured.background!), `${theme} ${name} unreadable`).toBeGreaterThan(0.4);
    }

    // A light theme must actually produce a light page.
    if (theme === 'White' || theme === 'Beige') {
      expect(measured.background!, `${theme} page is still dark`).toBeGreaterThan(0.7);
    } else {
      expect(measured.background!, `${theme} page should stay dark`).toBeLessThan(0.35);
    }
  }
});

test('the homepage primary button stays legible in a light theme', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Change homepage theme' }).click();
  await page.getByRole('radio', { name: 'White', exact: true }).click();
  await page.waitForTimeout(600);

  const contrast = await page.evaluate(() => {
    const luminance = (value: string) => {
      const parts = (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      return parts.length < 3 ? null : (0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2]) / 255;
    };
    const button = document.querySelector('.xv-hc-btn-primary');
    if (!button) return null;
    const style = getComputedStyle(button);
    const text = luminance(style.color);
    const background = luminance(style.backgroundColor);
    return text === null || background === null ? null : Math.abs(text - background);
  });

  expect(contrast, 'primary button contrast unmeasurable').not.toBeNull();
  expect(contrast!, 'primary button text is not legible on its own fill').toBeGreaterThan(0.35);
});
