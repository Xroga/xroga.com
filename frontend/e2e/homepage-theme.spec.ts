import { expect, test } from '@playwright/test';

const THEMES = [
  {
    label: 'White',
    bodyClass: 'theme-white',
    light: true,
    artwork: 'xroga-light-clouds-bg.png',
    mobileArtwork: 'xroga-light-clouds-bg-mobile.webp',
  },
  {
    label: 'Beige',
    bodyClass: 'theme-beige',
    light: true,
    artwork: 'xroga-deep-work-bg.webp',
    mobileArtwork: 'xroga-deep-work-bg.webp',
  },
  {
    label: 'Gray',
    bodyClass: 'theme-gray',
    light: false,
    artwork: 'xroga-gray-code-city-bg.webp',
    mobileArtwork: 'xroga-gray-code-city-bg-mobile.webp',
  },
  {
    label: 'Black',
    bodyClass: 'theme-black',
    light: false,
    artwork: 'xroga-black-clouds-bg.webp',
    mobileArtwork: 'xroga-black-clouds-bg.webp',
  },
] as const;

test('every visible homepage region follows all four theme selections', async ({ page }) => {
  await page.goto('/');

  for (const theme of THEMES) {
    await page.getByRole('button', { name: 'Change homepage theme' }).click();
    await page.getByRole('radio', { name: theme.label, exact: true }).click();
    await expect(page.locator('body')).toHaveClass(new RegExp(theme.bodyClass));
    // The product deliberately cross-fades theme colours. Measure the settled
    // theme rather than an in-between frame where text has switched before the
    // button fill completes its transition.
    await page.waitForTimeout(600);

    const result = await page.evaluate(() => {
      type Rgb = { r: number; g: number; b: number; a: number };

      const parse = (value: string): Rgb | null => {
        const srgb = value.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/);
        if (srgb) {
          return {
            r: Number(srgb[1]) * 255,
            g: Number(srgb[2]) * 255,
            b: Number(srgb[3]) * 255,
            a: srgb[4] == null ? 1 : Number(srgb[4]),
          };
        }

        const rgb = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/);
        if (!rgb) return null;
        return {
          r: Number(rgb[1]),
          g: Number(rgb[2]),
          b: Number(rgb[3]),
          a: rgb[4] == null ? 1 : Number(rgb[4]),
        };
      };

      const channel = (value: number) => {
        const normalized = value / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (value: Rgb) =>
        0.2126 * channel(value.r) + 0.7152 * channel(value.g) + 0.0722 * channel(value.b);
      const ratio = (foreground: Rgb, background: Rgb) => {
        const lighter = Math.max(luminance(foreground), luminance(background));
        const darker = Math.min(luminance(foreground), luminance(background));
        return (lighter + 0.05) / (darker + 0.05);
      };

      const surfaceFor = (element: Element): Rgb | null => {
        let current: Element | null = element;
        while (current) {
          const colour = parse(getComputedStyle(current).backgroundColor);
          if (colour && colour.a > 0.1) return colour;
          current = current.parentElement;
        }
        return null;
      };

      const contrastFor = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const foreground = parse(getComputedStyle(element).color);
        const background = surfaceFor(element);
        return foreground && background ? ratio(foreground, background) : null;
      };

      const wrapper = document.querySelector('.xv-home-coding');
      const wrapperBackground = wrapper ? parse(getComputedStyle(wrapper).backgroundColor) : null;
      const artwork = document.querySelector('.xv-hc-bg-image');
      const launchIcon = document.querySelector('.xv-go-btn--home .xv-go-btn__icon');
      const launchButton = document.querySelector('.xv-go-btn--home');
      const launchLiquid = document.querySelector('.xv-go-btn--home .xv-go-btn__liquid');
      const launchIconColour = launchIcon ? parse(getComputedStyle(launchIcon).color) : null;
      const launchSurfaces = [
        launchButton ? parse(getComputedStyle(launchButton).backgroundColor) : null,
        launchLiquid ? parse(getComputedStyle(launchLiquid).backgroundColor) : null,
        launchLiquid ? parse(getComputedStyle(launchLiquid, '::before').backgroundColor) : null,
        launchLiquid ? parse(getComputedStyle(launchLiquid, '::after').backgroundColor) : null,
      ].filter((value): value is Rgb => value !== null && value.a > 0.1);

      return {
        pageLuminance: wrapperBackground ? luminance(wrapperBackground) : null,
        artwork: artwork ? getComputedStyle(artwork).backgroundImage : null,
        launchIconContrast:
          launchIconColour && launchSurfaces.length > 0
            ? Math.min(...launchSurfaces.map((surface) => ratio(launchIconColour, surface)))
            : null,
        text: {
          brand: contrastFor('.xv-hc-brand'),
          heroCopy: contrastFor('.xv-hc-sub'),
          heroEmphasis: contrastFor('.xv-hc-headline-em'),
          promptCopy: contrastFor('.xv-hc-prompt-typewriter'),
          showcaseTitle: contrastFor('article h3'),
          showcaseCopy: contrastFor('article p'),
          featureTitle: contrastFor('.xv-hc-features-headline'),
          featureItem: contrastFor('.xv-hc-feature-list strong'),
          shipCard: contrastFor('.xv-hc-ship-card h3'),
          evidenceCard: contrastFor('.xv-hc-ent-card h3'),
          faq: contrastFor('.xv-hc-faq-q'),
          footer: contrastFor('.xv-hc-footer a'),
        },
        controls: {
          primary: contrastFor('.xv-hc-btn-primary'),
          secondary: contrastFor('.xv-hc-btn-ghost'),
          theme: contrastFor('.xv-home-theme-trigger'),
          integration: contrastFor('.xv-hc-prompt-integration'),
          launch: contrastFor('.xv-go-btn--home'),
        },
      };
    });

    expect(result.pageLuminance, `${theme.label} page background`).not.toBeNull();
    expect(result.artwork, `${theme.label} should use its intended background artwork`).toContain(theme.artwork);
    expect(result.launchIconContrast, `${theme.label} launch icon contrast could not be measured`).not.toBeNull();
    expect(result.launchIconContrast!, `${theme.label} launch icon is not visible`).toBeGreaterThanOrEqual(3);
    if (theme.light) {
      expect(result.pageLuminance!, `${theme.label} should be a light homepage`).toBeGreaterThan(0.75);
    } else {
      expect(result.pageLuminance!, `${theme.label} should be a dark homepage`).toBeLessThan(0.08);
    }

    for (const [name, contrast] of Object.entries(result.text)) {
      expect(contrast, `${theme.label} ${name} contrast could not be measured`).not.toBeNull();
      expect(contrast!, `${theme.label} ${name} is not readable`).toBeGreaterThanOrEqual(4.5);
    }

    for (const [name, contrast] of Object.entries(result.controls)) {
      expect(contrast, `${theme.label} ${name} contrast could not be measured`).not.toBeNull();
      expect(contrast!, `${theme.label} ${name} is not readable`).toBeGreaterThanOrEqual(3);
    }

  }
});

test('homepage theme choice survives a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Change homepage theme' }).click();
  await page.getByRole('radio', { name: 'Beige', exact: true }).click();
  await expect(page.locator('body')).toHaveClass(/theme-beige/);

  await page.reload();
  await expect(page.locator('body')).toHaveClass(/theme-beige/);
  await expect(page.locator('.xv-hc-brand')).toBeVisible();
  await expect(page.locator('.xv-hc-prompt-shell')).toBeVisible();
});

test('all four homepage themes remain usable at the mobile breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  for (const theme of THEMES) {
    await page.getByRole('button', { name: 'Change homepage theme' }).click();
    await page.getByRole('radio', { name: theme.label, exact: true }).click();
    await page.waitForTimeout(600);

    await expect(page.locator('.xv-hc-brand')).toBeVisible();
    await expect(page.locator('.xv-hc-prompt-shell')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Launch' })).toBeVisible();

    const mobileArtwork = await page.locator('.xv-hc-bg-image').evaluate((element) =>
      getComputedStyle(element).backgroundImage,
    );
    expect(mobileArtwork, `${theme.label} should use its mobile artwork`).toContain(
      theme.mobileArtwork,
    );

    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(dimensions.document, `${theme.label} introduces horizontal overflow`).toBeLessThanOrEqual(
      dimensions.viewport + 1,
    );
  }
});
