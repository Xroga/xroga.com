import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

test('the right Team panel and dedicated settings share the actual Paid team roster', async ({ page }) => {
  test.setTimeout(100_000);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.XB01_DISPOSABLE_SUPABASE !== '1' ||
      process.env.E2E_ISOLATED_PROJECT_REF !== 'local-disposable' ||
      supabaseUrl !== 'http://127.0.0.1:54321' ||
      process.env.SUPABASE_URL !== supabaseUrl || !serviceKey) {
    throw new Error('Teams browser tests require the disposable local Supabase fixture.');
  }

  await page.goto('/workspace');
  const trigger = page.getByRole('button', { name: 'Team', exact: true });
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Team workspace' });
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveCSS('right', '0px');
  await expect(drawer.getByRole('heading', { name: 'Sign in to manage teams' })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Close team panel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await drawer.getByRole('link', { name: 'Open full Team settings' }).click();
  await expect(page).toHaveURL(/\/settings\/teams$/);
  await expect(page.getByRole('heading', { name: 'Team settings', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create team' })).toHaveCount(0);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const id = randomUUID();
  const email = `teams-browser-${id}@example.invalid`;
  const password = `Synthetic!Aa9-${id}`;
  const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(user.error).toBeNull();
  expect(user.data.user).toBeTruthy();
  const userId = user.data.user!.id;
  const setup = await admin.from('profiles').update({
    display_name: 'Team browser owner', contact_phone: '+12025550189',
    onboarding: { status: 'completed', current_step: 'complete', backfilled: true },
  }).eq('id', userId).select('id').single();
  expect(setup.error).toBeNull();

  await page.getByRole('link', { name: 'Sign in', exact: true })
    .and(page.locator('a[href="/auth/login?next=%2Fsettings%2Fteams"]')).click();
  const form = page.locator('form', { has: page.locator('#login-email') });
  await form.locator('#login-email').fill(email);
  await form.locator('#login-password').fill(password);
  await form.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/settings\/teams$/, { timeout: 30_000 });
  await expect(page.getByRole('alert').filter({ hasText: 'active individual Paid subscription' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create team' })).toHaveCount(0);

  const started = new Date();
  const entitlement = await admin.rpc('activate_xroga_paid_cycle', {
    p_user_id: userId, p_provider_reference: `teams-browser-${id}`,
    p_starts_at: started.toISOString(), p_ends_at: new Date(started.getTime() + 86_400_000).toISOString(),
  });
  expect(entitlement.error).toBeNull();
  const membership = await admin.from('whop_memberships').insert({
    user_id: userId, whop_membership_id: `mem_teams_browser_${id}`,
    whop_plan_id: 'plan_hlV1A10I5QfSP', whop_account_id: 'biz_qhYONL4RebGX96', status: 'active',
  });
  expect(membership.error).toBeNull();
  await page.reload();
  const name = `Browser test team ${id.slice(0, 8)}`;
  await page.getByLabel('Team name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Create team' }).click();
  await expect(page.getByRole('heading', { name: 'Members', exact: true })).toBeVisible();
  await expect(page.getByText('Team browser owner · owner', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resend pending invitation' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent membership activity' })).toBeVisible();

  await page.getByRole('link', { name: 'Back to Workspace' }).click();
  await trigger.click();
  await drawer.getByLabel('Manage a team').selectOption({ label: `${name} (owner)` });
  await expect(drawer.getByText('Team browser owner · owner', { exact: true })).toBeVisible();
  // No invitation is sent. The fixture team belongs solely to the disposable CI database.
});
