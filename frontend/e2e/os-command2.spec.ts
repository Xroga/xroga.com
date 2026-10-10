import { expect, test } from '@playwright/test';

test('clinic choices follow the same example from Genome to result', async ({ page }) => {
  const forbidden: string[] = [];
  page.on('request', (request) => { if (/\/api\/(admin|operations|chat|swarm|projects)/.test(request.url())) forbidden.push(request.url()); });
  await page.goto('/os-preview/workspace');
  await page.getByLabel('Example project').selectOption('clinic');
  await page.getByLabel(/Illustrative budget/).fill('24');
  await page.getByRole('link', { name: /Select foundation/ }).click();
  await page.getByRole('button', { name: /Accessible booking foundation/ }).click();
  await page.goto('/os-preview/employees');
  await page.locator('.os-catalog-item').filter({ hasText: 'Frontend Engineer' }).click();
  await page.goto('/os-preview/coding');
  await page.getByRole('button', { name: 'Accept example patch' }).click();
  await page.getByRole('button', { name: 'Run deterministic example tests' }).click();
  await expect(page.getByText('PASS · validation boundary')).toBeVisible();
  await page.goto('/os-preview/experience');
  await page.getByRole('button', { name: 'Approve candidate example' }).click();
  await expect(page.getByText(/approved demo.*Production reuse is unavailable/i)).toBeVisible();
  expect(forbidden).toEqual([]);
});

test('browser/CRM example connects to workflow approval and retry', async ({ page }) => {
  await page.goto('/os-preview/browser');
  await page.getByRole('checkbox', { name: /only this local simulation/ }).check();
  await page.getByRole('button', { name: 'Step through example' }).click();
  await page.getByRole('button', { name: 'Step through example' }).click();
  await page.getByRole('button', { name: 'Retry prior example step' }).click();
  await page.goto('/os-preview/automations');
  await page.getByRole('button', { name: 'Run dry run' }).click();
  await expect(page.getByText(/Dry run: passed demo/)).toBeVisible();
});

test('repair review reaches an example benchmark without real PR', async ({ page }) => {
  await page.goto('/os-preview/coding');
  await page.getByRole('button', { name: 'Broken checkout fixture' }).click();
  await page.getByRole('button', { name: 'Run deterministic example tests' }).click();
  await expect(page.getByText('FAIL · validation boundary')).toBeVisible();
  await page.getByRole('button', { name: 'Accept example patch' }).click();
  await page.getByRole('button', { name: 'Run deterministic example tests' }).click();
  await expect(page.getByText('PASS · validation boundary')).toBeVisible();
  await page.goto('/os-preview/bench');
  await page.getByRole('button', { name: 'Inspect example gate' }).first().click();
  await expect(page.getByText(/Production promotion is unavailable/)).toBeVisible();
});

test('founder decision remains behind signed-out server gate', async ({ page }) => {
  await page.goto('/os-preview/founder');
  await expect(page).not.toHaveURL(/\/os-preview\/founder\/?$/);
  await expect(page.getByText('Fictional user pain signal')).toHaveCount(0);
});
