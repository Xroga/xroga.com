import { expect, test } from '@playwright/test';

test('preview fits five widths and four existing themes without horizontal overflow', async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320,390,768,1024,1440]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await page.goto('/os-preview/workspace');
    for (const theme of ['theme-white','theme-beige','theme-gray','theme-black']) {
      await page.evaluate((name) => {
        document.body.classList.remove('theme-white','theme-beige','theme-gray','theme-black');
        document.body.classList.add(name);
      }, theme);
      await expect(page.getByRole('heading', { level: 1, name: 'Workspace' })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${width}px ${theme} overflow`).toBeLessThanOrEqual(1);
      const surface = await page.locator('.os-panel').first().evaluate((node) => getComputedStyle(node).backgroundColor);
      expect(surface, `${width}px ${theme} unpainted panel`).not.toBe('rgba(0, 0, 0, 0)');
      if (width === 390 && theme === 'theme-black') await page.screenshot({ path: 'docs/ux-prototype/screenshots/command3-workspace-mobile-dark.png', fullPage: true, animations: 'disabled' });
      if (width === 1440 && theme === 'theme-white') await page.screenshot({ path: 'docs/ux-prototype/screenshots/command3-workspace-desktop-light.png', fullPage: true, animations: 'disabled' });
    }
  }
});

test('journey evidence remains readable at high zoom and narrow width', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 800 });
  await page.goto('/os-preview/journey');
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  await expect(page.getByRole('heading', { name: 'See the work before it happens.' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
