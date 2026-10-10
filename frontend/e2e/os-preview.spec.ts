import { expect, test } from '@playwright/test';

test('guest can complete the labelled clinic demo without contacting diagnostic APIs', async ({ page }) => {
  const forbiddenRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/(admin\/errors|operations\/readiness|swarm\/execute)/.test(request.url())) forbiddenRequests.push(request.url());
  });
  const response = await page.goto('/os-preview');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: /from an outcome to a clear result/i })).toBeVisible();
  await page.getByRole('link', { name: /try an example journey/i }).click();
  await expect(page.getByText('Demo experience — no real work or external changes are performed.').first()).toBeVisible();
  await page.getByRole('checkbox', { name: /no permission is granted/i }).check();
  await page.getByRole('button', { name: /simulate run/i }).click();
  await expect(page.getByText('DEMO / NOT EXECUTED')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/External changes: 0\. Real evidence collected: 0/)).toBeVisible();
  expect(forbiddenRequests).toEqual([]);
});

test('alternate approval path and controls are real, not static labels', async ({ page }) => {
  await page.goto('/os-preview/journey');
  await page.getByLabel('Explore an outcome').selectOption('needs-approval');
  await page.getByRole('checkbox', { name: /no permission is granted/i }).check();
  await page.getByRole('button', { name: /simulate run/i }).click();
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Step' }).click();
  await page.getByRole('button', { name: 'Step' }).click();
  await page.getByRole('button', { name: 'Step' }).click();
  await expect(page.getByText('needs approval · simulated outcome')).toBeVisible();
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByText('No receipt yet.')).toBeVisible();
});

test('mobile navigation has an interactive browser destination and keyboard escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/os-preview');
  await page.getByRole('button', { name: 'Open preview navigation' }).click();
  await expect(page.getByRole('complementary', { name: 'Xroga OS preview navigation' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open preview navigation' })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Open preview navigation' }).click();
  await page.locator('aside[aria-label="Xroga OS preview navigation"] a[href="/os-preview/browser"]').click();
  await expect(page.getByRole('heading', { name: 'Browser Operator' })).toBeVisible();
  await expect(page.getByText('Demo experience — no real work or external changes are performed.')).toBeVisible();
});

test('signed-out founder URL fails closed', async ({ page }) => {
  await page.goto('/os-preview/founder');
  await expect(page).not.toHaveURL(/\/os-preview\/founder\/?$/);
  await expect(page.getByText('Diagnostics integration pending policy review.')).toHaveCount(0);
  await expect(page.getByText('Backend connection pending')).toHaveCount(0);
});

test('all public preview destinations resolve without horizontal overflow at target widths', async ({ page }) => {
  test.setTimeout(180_000);
  const sections = ['overview','workspace', 'projects','activity','coding', 'browser','research', 'automations', 'employees', 'work-packs', 'genome','experience','skills', 'artifacts', 'drive', 'insights','models','bench', 'settings','help'];
  for (const section of sections) {
    const response = await page.goto(`/os-preview/${section}`);
    expect(response?.status(), section).toBe(200);
    await expect(page.getByRole('heading', { level: 1 }), section).toBeVisible();
  }
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow, `${width}px horizontal overflow`).toBe(false);
  }
});
