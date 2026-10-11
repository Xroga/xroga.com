import { expect, test } from '@playwright/test';
import { requireFounderPreviewSession } from './os-preview-founder-fixture';

requireFounderPreviewSession();

test('editable outcome draft persists across the preview and reset stays scoped', async ({ page }) => {
  const forbidden: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && /\/api\/(?:swarm|admin|operations|billing|projects|integrations)/.test(request.url())) forbidden.push(request.url());
  });
  await page.goto('/os-preview/journey');
  await page.getByLabel('Goal', { exact: true }).fill('Design an accessible sample booking flow.');
  await page.getByLabel(/Constraints — one per line/).fill('No patient records\nNo real calendar');
  await page.getByLabel(/A responsive sample appointment selection/).fill('Accessible booking screens');
  await page.reload();
  await expect(page.getByLabel('Goal', { exact: true })).toHaveValue('Design an accessible sample booking flow.');
  await expect(page.getByLabel(/A responsive sample appointment selection/)).toHaveValue('Accessible booking screens');
  await page.goto('/os-preview/workspace');
  await expect(page.getByRole('heading', { name: 'Design an accessible sample booking flow.' })).toBeVisible();
  await page.goto('/os-preview/settings');
  await page.getByRole('button', { name: /Reset all Command 2 demo data/ }).click();
  await page.goto('/os-preview/journey');
  await expect(page.getByLabel('Goal', { exact: true })).toHaveValue('Build a clinic appointment booking website and set up confirmations.');
  expect(forbidden).toEqual([]);
});

test('simulated VERIFIED result has fixture checks while real evidence remains NOT EXECUTED', async ({ page }) => {
  await page.goto('/os-preview/journey');
  await page.getByRole('checkbox', { name: /no permission is granted/i }).check();
  await page.getByRole('button', { name: 'Simulate run' }).click();
  await expect(page.getByText('verified · simulated outcome')).toBeVisible({ timeout: 15_000 });
  const evidence = page.getByRole('region', { name: 'Simulated acceptance evidence' });
  await expect(evidence.getByText('PASS · simulated')).toHaveCount(3);
  await expect(page.getByText('Real evidence collected: 0')).toBeVisible();
});

test('OS preview does not deliver founder fixture code in its loaded scripts', async ({ page }) => {
  const scripts: string[] = [];
  page.on('response', async (response) => {
    if (!response.url().includes('/_next/static/') || !response.url().endsWith('.js')) return;
    scripts.push(await response.text());
  });
  await page.goto('/os-preview');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.join('\n')).not.toContain('False-success verification attempt');
  expect(scripts.join('\n')).not.toContain('Fictional user pain signal');
});

test('browser example requires an explicit recovery or denial before any sample postcondition', async ({ page }) => {
  const forbidden: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('example.crm.invalid') || (request.method() !== 'GET' && request.url().includes('/api/'))) forbidden.push(request.url());
  });
  await page.goto('/os-preview/browser');
  await page.getByRole('checkbox', { name: /only this local simulation/ }).check();
  for (let index = 0; index < 4; index += 1) await page.getByRole('button', { name: 'Step through example' }).click();
  await expect(page.getByText('Recovery choice required; the failure cannot be stepped past.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Step through example' })).toBeDisabled();
  await page.getByLabel('Example failure').selectOption('selector');
  await expect(page.getByText(/fictional page target no longer matches/)).toBeVisible();
  await page.getByRole('button', { name: 'Stop with blocked result' }).click();
  await expect(page.getByText(/Blocked example. No CRM change was made/)).toBeVisible();
  await page.getByRole('button', { name: 'Replay browser example' }).click();
  await page.getByRole('checkbox', { name: /only this local simulation/ }).check();
  for (let index = 0; index < 4; index += 1) await page.getByRole('button', { name: 'Step through example' }).click();
  await page.getByRole('button', { name: 'Use bounded visual fallback' }).click();
  await page.getByRole('button', { name: 'Step through example' }).click();
  await expect(page.getByText('Example postcondition reviewed after bounded fallback. DEMO / NOT EXECUTED.')).toBeVisible();
  expect(forbidden).toEqual([]);
});

test('preview routes remain usable at narrow width and show truthful coming-soon state', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/os-preview/drive');
  await expect(page.getByRole('heading', { name: 'Coming soon' })).toBeVisible();
  await expect(page.getByText(/durable work/i)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
