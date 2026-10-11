import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const state of [
  { route: '/os-preview', width: 1440, height: 900, label: 'overview desktop' },
  { route: '/os-preview/journey', width: 390, height: 844, label: 'journey mobile' },
  { route: '/os-preview/automations', width: 768, height: 1000, label: 'workflow tablet' },
  { route: '/os-preview/drive', width: 320, height: 700, label: 'coming-soon narrow' },
]) {
  test(`axe WCAG review: ${state.label}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: state.width, height: state.height });
    await page.goto(state.route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
    const violations = results.violations.map((item) => ({
      id: item.id, impact: item.impact, description: item.description,
      nodes: item.nodes.map((node) => node.target.join(' ')).slice(0, 6),
    }));
    testInfo.annotations.push({ type: 'axe-summary', description: JSON.stringify({ url: state.route, violations }) });
    expect(violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'), JSON.stringify(violations, null, 2)).toEqual([]);
  });
}

test('mobile drawer Escape returns keyboard focus to the opener', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/os-preview');
  const opener = page.getByRole('button', { name: 'Open preview navigation' });
  await opener.focus();
  await opener.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Xroga OS preview navigation' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
});
