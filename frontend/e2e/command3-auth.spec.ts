import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const backendUrl = process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:4000';
const expectedRelease = process.env.EXPECTED_RELEASE_SHA?.trim() ?? '';
const launchBillingApiUrl = process.env.LAUNCH_BILLING_API_URL?.replace(/\/$/, '') ?? '';
const run = randomUUID();
const password = `C3!${randomUUID()}aA9`;
const ownerEmail = `command3-owner-${run}@example.invalid`;
const outsiderEmail = `command3-outsider-${run}@example.invalid`;
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
let ownerId = ''; let outsiderId = ''; let ownerProjectId = ''; let outsiderProjectId = '';

async function browserSession(page: import('@playwright/test').Page): Promise<{ status: number; authenticated: boolean }> {
  return page.evaluate(async () => {
    const response = await fetch('/api/session', { cache: 'no-store' });
    const body = await response.json();
    return { status: response.status, authenticated: body.authenticated === true };
  });
}

test.beforeAll(async () => {
  const owner = await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true, user_metadata: { fixture: 'command3_isolated_demo' } });
  const outsider = await admin.auth.admin.createUser({ email: outsiderEmail, password, email_confirm: true, user_metadata: { fixture: 'command3_isolated_demo' } });
  if (owner.error || outsider.error || !owner.data.user || !outsider.data.user) throw new Error('Temporary verified test users could not be created');
  ownerId = owner.data.user.id; outsiderId = outsider.data.user.id;
  await admin.from('profiles').upsert([{ id: ownerId, display_name: 'Command 3 Owner' }, { id: outsiderId, display_name: 'Command 3 Outsider' }]);
  const projects = await admin.from('projects').insert([
    { user_id: ownerId, name: `command3-demo-owner-${run}`, type: 'app', status: 'in_progress' },
    { user_id: outsiderId, name: `command3-demo-outsider-${run}`, type: 'app', status: 'in_progress' },
  ]).select('id,user_id');
  if (projects.error || !projects.data) throw new Error('Isolated tenant fixtures could not be created');
  ownerProjectId = projects.data.find((item) => item.user_id === ownerId)!.id;
  outsiderProjectId = projects.data.find((item) => item.user_id === outsiderId)!.id;
});

test.afterAll(async () => {
  if (ownerId) await admin.auth.admin.deleteUser(ownerId);
  if (outsiderId) await admin.auth.admin.deleteUser(outsiderId);
});

test('real Supabase login persists, Operations works, cross-tenant access is denied, and logout clears the session', async ({ page }) => {
  let browserBearer = '';
  page.on('request', (request) => {
    if (request.url().includes('/api/operations/') && request.headers().authorization?.startsWith('Bearer ')) browserBearer = request.headers().authorization;
  });
  await page.goto('/auth/login');
  const webRelease = await page.evaluate(async () => {
    const response = await fetch('/api/release', { cache: 'no-store' });
    return { status: response.status, body: await response.json() as { release?: string; environment?: string } };
  });
  const apiReadiness = await fetch(`${backendUrl}/ready`, { headers: { Accept: 'application/json' } });
  const apiRelease = await apiReadiness.json() as { release?: string };
  expect(webRelease.status).toBe(200);
  expect(apiReadiness.status).toBe(200);
  if (expectedRelease) {
    expect(webRelease.body.release).toBe(expectedRelease);
    expect(apiRelease.release).toBe(expectedRelease);
  }
  await page.getByLabel('Email').fill(ownerEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/(workspace|dashboard)/);
  const firstSession = await browserSession(page);
  expect(firstSession).toEqual({ status: 200, authenticated: true });
  await page.reload();
  const refreshedSession = await browserSession(page);
  expect(refreshedSession).toEqual({ status: 200, authenticated: true });

  const routeChecks = [
    '/workspace',
    '/dashboard',
    '/dashboard/projects',
    '/dashboard/integrations',
    '/dashboard/operations',
    '/dashboard/growth',
    '/dashboard/publish',
    '/settings?tab=plan',
    '/settings',
  ];
  for (const route of routeChecks) {
    await page.goto(route);
    await expect(page).not.toHaveURL(/\/auth\/login/);
    const shellState = await page.evaluate(() => ({
      text: document.body?.innerText ?? '',
      overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
    }));
    expect(shellState.text).not.toMatch(/application error|something went wrong|internal server error/i);
    expect(shellState.text).not.toContain("We give our best — perfection is Allah's alone. Xroga verifies before publish.");
    expect(shellState.overflow).toBe(false);
  }

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 820, height: 1180 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/workspace');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);
  }

  await page.goto('/dashboard/operations');
  await expect(page.getByText(`command3-demo-owner-${run}`)).toBeVisible();
  expect(browserBearer).toMatch(/^Bearer /);
  const allowed = await fetch(`${backendUrl}/api/operations/products/${ownerProjectId}`, { headers: { Authorization: browserBearer } });
  const denied = await fetch(`${backendUrl}/api/operations/products/${outsiderProjectId}`, { headers: { Authorization: browserBearer } });
  expect(allowed.status).toBe(200); expect(denied.status).toBe(403);
  const notifications = await fetch(`${backendUrl}/api/notifications`, { headers: { Authorization: browserBearer } });
  const unreadNotifications = await fetch(`${backendUrl}/api/notifications/unread-count`, { headers: { Authorization: browserBearer } });
  expect(notifications.status).toBe(200);
  expect(await notifications.json()).toEqual([]);
  expect(unreadNotifications.status).toBe(200);
  expect(await unreadNotifications.json()).toEqual({ count: 0 });
  let billingCheckout: 'not_requested' | 'verified' = 'not_requested';
  if (launchBillingApiUrl) {
    const billingStatusResponse = await fetch(`${launchBillingApiUrl}/api/billing/status`, { headers: { Authorization: browserBearer } });
    const billingStatus = await billingStatusResponse.json() as {
      lemonApi?: boolean;
      lemonWebhook?: boolean;
      lemonStore?: boolean;
      plans?: Array<{ tier?: string; ready?: boolean }>;
    };
    expect(billingStatusResponse.status).toBe(200);
    expect(billingStatus.lemonApi).toBe(true);
    expect(billingStatus.lemonWebhook).toBe(true);
    expect(billingStatus.lemonStore).toBe(true);
    expect(billingStatus.plans?.some((plan) => plan.tier === 'spark' && plan.ready === true)).toBe(true);
    const checkoutResponse = await fetch(`${launchBillingApiUrl}/api/billing/create-checkout`, {
      method: 'POST',
      headers: { Authorization: browserBearer, 'Content-Type': 'application/json' },
      body: JSON.stringify({ planTier: 'spark' }),
    });
    const checkout = await checkoutResponse.json() as { checkoutUrl?: string };
    expect(checkoutResponse.status).toBe(200);
    const checkoutUrl = new URL(checkout.checkoutUrl ?? '');
    expect(checkoutUrl.protocol).toBe('https:');
    expect(checkoutUrl.hostname === 'lemonsqueezy.com' || checkoutUrl.hostname.endsWith('.lemonsqueezy.com')).toBe(true);
    billingCheckout = 'verified';
  }
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Security' }).click();
  await page.getByRole('button', { name: 'Logout' }).first().click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  await page.goto('/dashboard/operations');
  await expect(page).toHaveURL(/\/auth\/login/);
  const loggedOut = await browserSession(page); expect(loggedOut).toEqual({ status: 401, authenticated: false });
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/command3-auth-evidence.json', JSON.stringify({ projectRef: new URL(supabaseUrl).hostname.split('.')[0], expectedRelease: expectedRelease || null, webRelease: webRelease.body.release ?? 'unavailable', apiRelease: apiRelease.release ?? 'unavailable', login: 'verified', sessionRefresh: 'verified', authenticatedRoutes: routeChecks.length, responsiveViewports: 3, operationsApi: allowed.status, crossTenantApi: denied.status, notificationsApi: notifications.status, unreadNotificationsApi: unreadNotifications.status, billingCheckout, logout: loggedOut.status, fixtureIsolation: 'temporary users and projects cascade-deleted', observedAt: new Date().toISOString() }, null, 2));
});
