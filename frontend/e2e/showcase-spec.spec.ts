import { expect, test } from '@playwright/test';

/**
 * Covers the requirements added in this round: real thumbnails instead of six live
 * runtimes on a listing page, the new product features, theme readability across the
 * Xroga themes, and the homepage plan section removal.
 */

const SLUGS = [
  'modern-business-website',
  'real-estate-platform',
  'booking-platform',
  'android-app',
  'ai-saas-chatbot',
  'playable-web-game',
];

/* ------------------------------------------------------------- performance */

test('a listing page shows real thumbnails, not six live application runtimes', async ({ page }) => {
  await page.goto('/');
  await page.locator('#showcase-home-heading').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);

  // The whole point: cards are images, so no product boots here. next/image rewrites
  // the src through its optimizer, so match the encoded path rather than the literal.
  const images = page.locator('#showcase-home-heading').locator('..').locator('img[src*="thumbnails"]');
  await expect(images).toHaveCount(6);
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('every stored thumbnail resolves and is a real image', async ({ page, request }) => {
  for (const slug of SLUGS) {
    for (const view of ['desktop', 'tablet', 'mobile']) {
      const response = await request.get(`/showcase/thumbnails/${slug}-${view}.webp`);
      expect(response.status(), `${slug}-${view}`).toBe(200);
      expect(Number(response.headers()['content-length'] ?? 0), `${slug}-${view} size`).toBeGreaterThan(2000);
    }
  }

  // And they decode, rather than merely returning bytes.
  await page.goto('/showcase');
  const decoded = await page.evaluate(async () => {
    const image = new Image();
    image.src = '/showcase/thumbnails/modern-business-website-desktop.webp';
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  });
  expect(decoded.width).toBeGreaterThan(400);
  expect(decoded.height).toBeGreaterThan(200);
});

test('the interactive product still loads on the showcase page itself', async ({ page }) => {
  await page.goto('/showcase');
  // The spotlight is the one place a runtime is expected on a listing page.
  await expect(page.locator('iframe')).toHaveCount(1);
  await expect(page.frameLocator('iframe').first().getByRole('heading', { level: 1 })).toBeVisible();
});

/* ------------------------------------------------------------- new features */

test('modern business: the 2026 editorial redesign and truthful demo form work', async ({ page }) => {
  await page.goto('/showcase/modern-business-website/preview');

  await expect(page.getByRole('heading', { name: /design\. build\. ship\./i })).toBeVisible();
  await expect(page.getByText('Illustrative demo').first()).toBeVisible();
  await expect(page.getByText(/sample testimonials for the showcase/i)).toBeVisible();

  const form = page.locator('.mb26-contact-form');
  await form.getByRole('button', { name: /send enquiry/i }).click();
  await expect(form.locator('[aria-invalid="true"]')).toHaveCount(3);
  await form.getByLabel('Name').fill('Sample Person');
  await form.getByLabel('Work email').fill('person@example.com');
  await form.getByLabel('What do you need?').fill('A new product marketing website.');
  await form.getByRole('button', { name: /send enquiry/i }).click();
  await expect(form.getByRole('status')).toContainText(/not sent or stored/i);
});

test('real estate: the gallery switches views and the enquiry form validates', async ({ page }) => {
  await page.goto('/showcase/real-estate-platform/preview');
  await page.getByRole('button', { name: 'View details' }).first().click();

  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();

  // Four gallery views, switchable.
  const tabs = drawer.getByRole('tab');
  await expect(tabs).toHaveCount(4);
  await expect(drawer.getByText('1 / 4')).toBeVisible();
  await tabs.nth(2).click();
  await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
  await expect(drawer.getByText('3 / 4')).toBeVisible();

  // Amenities and the map-ready slot.
  await expect(drawer.getByRole('heading', { name: 'Amenities' })).toBeVisible();
  await expect(drawer.getByRole('img', { name: /schematic location/i })).toBeVisible();

  // The enquiry form refuses empty input, then confirms nothing was sent.
  await drawer.getByRole('button', { name: /send enquiry/i }).click();
  await expect(drawer.locator('[aria-invalid="true"]').first()).toBeVisible();

  await drawer.getByLabel('Your name').fill('Sample Person');
  await drawer.getByLabel('Email').fill('person@example.com');
  await drawer.getByRole('button', { name: /send enquiry/i }).click();
  await expect(drawer.getByText(/not sent/i)).toBeVisible();
});

test('mobile app: the profile screen reports real local state', async ({ page }) => {
  await page.goto('/showcase/android-app/preview');

  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();

  // Saved count starts at zero and follows a real save.
  const savedStat = page.locator('.fb-profile-stats > div').first().locator('dd');
  await expect(savedStat).toHaveText('0');

  await page.getByRole('button', { name: 'Browse', exact: true }).click();
  await page.locator('.fb-item').first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await expect(savedStat).toHaveText('1');
  await expect(page.getByRole('heading', { name: /recently saved/i })).toBeVisible();
});

test('ai saas: the overview and the error state both work', async ({ page }) => {
  await page.goto('/showcase/ai-saas-chatbot/preview');

  // Overview is the landing surface and summarises real session state.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: /what is already built/i })).toBeVisible();

  await page.getByRole('button', { name: /open the workspace/i }).click();

  // Empty input keeps the control disabled rather than erroring.
  const send = page.locator('.ld-composer').getByRole('button', { name: 'Send' });
  await expect(send).toBeDisabled();

  // An over-long message is the failure a user can actually reach.
  await page.locator('.ld-composer textarea').fill('x'.repeat(4200));
  await expect(send).toBeEnabled();
  await send.click();
  // Scoped to the product's own alert: Next's route announcer also has role=alert.
  const alert = page.locator('.ld-error[role="alert"]');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(/longer than this template accepts/i);

  await alert.getByRole('button', { name: /dismiss/i }).click();
  await expect(alert).toBeHidden();
});

test('web game: sound is off by default, toggles, and persists', async ({ page }) => {
  await page.goto('/showcase/playable-web-game/preview');

  const toggle = page.getByRole('switch', { name: 'Sound' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  await page.reload();
  await expect(page.getByRole('switch', { name: 'Sound' })).toHaveAttribute('aria-checked', 'true');
});

/* ------------------------------------------------------------------ themes */

/**
 * Theme classes live on <body>. Checking computed contrast catches the class of bug
 * where a token is declared only at :root and therefore never follows the theme.
 */
const THEMES = ['theme-white', 'theme-beige', 'theme-gray', 'theme-black'];

test('showcase surfaces stay readable in every Xroga theme', async ({ page }) => {
  for (const theme of THEMES) {
    await page.goto('/showcase');
    await page.evaluate((name) => {
      document.body.classList.remove('theme-white', 'theme-beige', 'theme-gray', 'theme-black');
      document.body.classList.add(name);
    }, theme);
    await page.waitForTimeout(120);

    const contrast = await page.evaluate(() => {
      const luminance = (value: string) => {
        const parts = (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        if (parts.length < 3) return null;
        return (0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2]) / 255;
      };
      const heading = document.querySelector('h1');
      const card = document.querySelector('article');
      if (!heading || !card) return null;
      const text = luminance(getComputedStyle(heading).color);
      // Walk up for the first non-transparent background behind the card.
      let node: HTMLElement | null = card as HTMLElement;
      let background: number | null = null;
      while (node && background === null) {
        const value = getComputedStyle(node).backgroundColor;
        if (value && !value.includes('rgba(0, 0, 0, 0)')) background = luminance(value);
        node = node.parentElement;
      }
      if (text === null || background === null) return null;
      return Math.abs(text - background);
    });

    expect(contrast, `${theme} contrast could not be measured`).not.toBeNull();
    expect(contrast!, `${theme} heading is not readable against the card surface`).toBeGreaterThan(0.25);
  }
});

/* ------------------------------------------------------- homepage structure */

test('the homepage showcase section sits directly after the hero', async ({ page }) => {
  await page.goto('/');
  const order = await page.evaluate(() => {
    const hero = document.querySelector('.xv-hc-hero');
    const showcase = document.getElementById('showcase-home-heading')?.closest('section');
    if (!hero || !showcase) return null;
    // Node.DOCUMENT_POSITION_FOLLOWING === 4
    const follows = Boolean(hero.compareDocumentPosition(showcase) & 4);
    const between = [...document.querySelectorAll('section')].filter((node) => {
      const afterHero = Boolean(hero.compareDocumentPosition(node) & 4);
      const beforeShowcase = Boolean(showcase.compareDocumentPosition(node) & 2);
      return afterHero && beforeShowcase && !hero.contains(node) && !showcase.contains(node);
    }).length;
    return { follows, between };
  });
  expect(order).not.toBeNull();
  expect(order!.follows).toBe(true);
  expect(order!.between, 'no section should sit between the hero and the showcase').toBe(0);
});

test('the plan capacity section is gone from the homepage', async ({ page }) => {
  await page.goto('/');
  const body = await page.locator('body').innerText();
  for (const phrase of [
    'ONE XROGA AI PLAN',
    'Capacity designed to',
    'Balanced Month by default',
    'Complexity when it matters',
    'Completion stays protected',
  ]) {
    expect(body, `homepage still shows "${phrase}"`).not.toContain(phrase);
  }
  // The announcement banner and its date must survive the removal.
  await expect(page.getByText(/free through August 30, 2026/i)).toBeVisible();
});
