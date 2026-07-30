import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

// Settings requires a real authenticated session (see src/lib/supabase/middleware.ts —
// unauthenticated visits to any non-public route redirect to /auth/login). These tests
// follow the same real-Supabase-user pattern as command3-auth.spec.ts and therefore need
// NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set to a real (test) project.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const run = randomUUID();
const password = `Xv!${randomUUID()}aA9`;
const email = `settings-shell-${run}@example.com`;
let userId = '';

test.setTimeout(60_000);

test.beforeAll(async () => {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { fixture: 'settings_shell_e2e' },
  });
  if (created.error || !created.data.user) throw new Error('Temporary settings-shell test user could not be created');
  userId = created.data.user.id;
});

test.afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
});

async function signIn(page: Page, path: string) {
  await page.goto(`/auth/login?next=${encodeURIComponent(path)}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(path.replace(/[/?]/g, '\\$&')));
}

// Each test gets a fresh, isolated browser context with empty storage by
// default — no explicit localStorage reset needed (and page.addInitScript
// would re-run on every navigation, including page.reload(), wiping any
// persisted preference the test just set right before it re-checks it).

test('settings navigation exposes an ARIA tablist and syncs the active section to the URL', async ({ page }) => {
  await signIn(page, '/settings');

  const tablist = page.getByRole('tablist');
  await expect(tablist).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Theme' })).toBeVisible();

  await page.getByRole('tab', { name: 'Theme' }).click();
  await expect(page).toHaveURL(/tab=theme/);
  await expect(page.getByRole('tab', { name: 'Theme' })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('tab', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/tab=privacy/);
  await expect(page.getByText('Allow personal context')).toBeVisible();
});

test('deep-linking directly to a settings section opens that section', async ({ page }) => {
  await signIn(page, '/settings?tab=security');
  await expect(page.getByRole('tab', { name: 'Security' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Two-factor authentication (TOTP)')).toBeVisible();
});

test('mobile viewport shows a compact section selector instead of the desktop tab rail', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, '/settings');

  await expect(page.getByRole('tablist')).toBeHidden();
  const selector = page.getByLabel('Section');
  await expect(selector).toBeVisible();

  await selector.selectOption('theme');
  await expect(page).toHaveURL(/tab=theme/);
});

test('privacy toggles persist locally without a backend', async ({ page }) => {
  await signIn(page, '/settings?tab=privacy');

  const toggle = page.getByRole('switch', { name: 'Allow personal context' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  await page.reload();
  await expect(page.getByRole('switch', { name: 'Allow personal context' })).toHaveAttribute('aria-checked', 'true');
});

test('theme accent selection persists across reload', async ({ page }) => {
  await signIn(page, '/settings?tab=theme');

  const violet = page.getByRole('radio', { name: 'Violet' });
  await violet.click();
  await expect(violet).toHaveAttribute('aria-checked', 'true');

  await page.reload();
  await expect(page.getByRole('radio', { name: 'Violet' })).toHaveAttribute('aria-checked', 'true');
});

test('companion wardrobe: selecting a silhouette marks it equipped and persists', async ({ page }) => {
  await signIn(page, '/settings?tab=companion');

  await page.getByRole('tab', { name: 'Skins & Costumes' }).click();
  const builder = page.getByRole('radio', { name: 'Builder' });
  await builder.click();
  await expect(builder).toHaveAttribute('aria-checked', 'true');
  await expect(builder.getByText('Equipped')).toBeVisible();

  await page.reload();
  await page.getByRole('tab', { name: 'Skins & Costumes' }).click();
  await expect(page.getByRole('radio', { name: 'Builder' })).toHaveAttribute('aria-checked', 'true');
});

test('destructive account deletion requires typed confirmation and never submits without it', async ({ page }) => {
  await signIn(page, '/settings?tab=data-ai');

  await page.getByRole('button', { name: 'Delete account forever' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete account forever?' });
  await expect(dialog).toBeVisible();

  const confirmButton = dialog.getByRole('button', { name: 'Delete forever' });
  await expect(confirmButton).toBeDisabled();

  await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
  await expect(confirmButton).toBeEnabled();

  // Close without confirming — this test must never trigger real account deletion.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
