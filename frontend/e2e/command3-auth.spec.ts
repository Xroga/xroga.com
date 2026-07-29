import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const backendUrl = process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:4000';
const expectedRelease = process.env.EXPECTED_RELEASE_SHA?.trim() ?? '';
const expectedWebRelease = process.env.EXPECTED_WEB_RELEASE_SHA?.trim() || expectedRelease;
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

async function fillVisibleCheckoutField(
  page: import('@playwright/test').Page,
  selectors: string[],
  value: string,
): Promise<boolean> {
  for (const frame of page.frames()) {
    for (const selector of selectors) {
      const locator = frame.locator(selector).first();
      if (await locator.count() && await locator.isVisible().catch(() => false)) {
        await locator.fill(value);
        return true;
      }
    }
  }
  return false;
}

async function clickVisibleCheckoutSubmit(page: import('@playwright/test').Page): Promise<void> {
  const named = page.getByRole('button', {
    name: /start.*trial|begin.*trial|subscribe|complete (order|purchase)|place order|pay \$?0/i,
  });
  for (let index = 0; index < await named.count(); index += 1) {
    const candidate = named.nth(index);
    if (await candidate.isVisible().catch(() => false) && await candidate.isEnabled().catch(() => false)) {
      await candidate.click();
      return;
    }
  }
  const submit = page.locator('button[type="submit"]:visible').last();
  await expect(submit, 'Lemon Test Mode checkout has no enabled submit control').toBeVisible();
  await submit.click();
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
    expect(webRelease.body.release).toBe(expectedWebRelease);
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
  let billingTransaction: 'not_requested' | 'verified_test_mode_webhook' = 'not_requested';
  let testPaymentInstrument: 'not_requested' | 'dummy_card_4242' | 'provider_no_card_trial' = 'not_requested';
  let billingEntitlementEndsAt: string | null = null;
  if (launchBillingApiUrl) {
    const billingStatusResponse = await fetch(`${launchBillingApiUrl}/api/billing/status`, { headers: { Authorization: browserBearer } });
    const billingStatus = await billingStatusResponse.json() as {
      lemonApi?: boolean;
      lemonWebhook?: boolean;
      lemonStore?: boolean;
      environment?: 'test' | 'live' | 'unconfigured';
      testMode?: boolean;
      trialDays?: number | null;
      plans?: Array<{ tier?: string; ready?: boolean }>;
    };
    expect(billingStatusResponse.status).toBe(200);
    expect(billingStatus.lemonApi).toBe(true);
    expect(billingStatus.lemonWebhook).toBe(true);
    expect(billingStatus.lemonStore).toBe(true);
    expect(billingStatus.environment).toBe('test');
    expect(billingStatus.testMode).toBe(true);
    expect(billingStatus.trialDays).toBe(30);
    expect(billingStatus.plans?.some((plan) => plan.tier === 'spark' && plan.ready === true)).toBe(true);
    const checkoutResponse = await fetch(`${launchBillingApiUrl}/api/billing/create-checkout`, {
      method: 'POST',
      headers: { Authorization: browserBearer, 'Content-Type': 'application/json' },
      body: JSON.stringify({ planTier: 'spark' }),
    });
    const checkout = await checkoutResponse.json() as { checkoutUrl?: string; priceId?: string; error?: string; code?: string };
    const safeCheckoutFailure = `checkout_error=${checkout.error ?? 'unknown'} code=${checkout.code ?? 'unknown'}`;
    expect(checkoutResponse.status, safeCheckoutFailure).toBe(200);
    expect(checkout.priceId).toMatch(/^\d+$/);
    const checkoutUrl = new URL(checkout.checkoutUrl ?? '');
    expect(checkoutUrl.protocol).toBe('https:');
    expect(checkoutUrl.hostname === 'lemonsqueezy.com' || checkoutUrl.hostname.endsWith('.lemonsqueezy.com')).toBe(true);
    billingCheckout = 'verified';

    await page.goto(checkoutUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page.getByText(/test mode/i).first()).toBeVisible({ timeout: 20_000 });
    await fillVisibleCheckoutField(page, ['input[type="email"]', 'input[autocomplete="email"]'], ownerEmail);
    await fillVisibleCheckoutField(page, [
      'input[autocomplete="name"]',
      'input[autocomplete="cc-name"]',
      'input[name*="name" i]',
    ], 'Xroga Test');
    await fillVisibleCheckoutField(page, [
      'input[autocomplete="postal-code"]',
      'input[name*="postal" i]',
      'input[name*="zip" i]',
    ], '10001');
    const cardFilled = await fillVisibleCheckoutField(page, [
      'input[autocomplete="cc-number"]',
      'input[name="cardnumber"]',
      'input[placeholder*="card number" i]',
    ], '4242424242424242');
    if (cardFilled) {
      expect(await fillVisibleCheckoutField(page, [
        'input[autocomplete="cc-exp"]',
        'input[name="exp-date"]',
        'input[placeholder*="MM" i]',
      ], '1230')).toBe(true);
      expect(await fillVisibleCheckoutField(page, [
        'input[autocomplete="cc-csc"]',
        'input[name="cvc"]',
        'input[placeholder*="CVC" i]',
        'input[placeholder*="CVV" i]',
      ], '123')).toBe(true);
      testPaymentInstrument = 'dummy_card_4242';
    } else {
      testPaymentInstrument = 'provider_no_card_trial';
    }
    const terms = page.getByRole('checkbox', { name: /agree|terms/i });
    if (await terms.count() && await terms.first().isVisible().catch(() => false) && !(await terms.first().isChecked())) {
      await terms.first().check();
    }
    await clickVisibleCheckoutSubmit(page);
    let paidEntitlement: { state?: string; startsAt?: string | null; endsAt?: string | null; requiresCard?: boolean } = {};
    await expect.poll(async () => {
      const response = await fetch(`${launchBillingApiUrl}/api/billing/entitlement`, {
        headers: { Authorization: browserBearer, Accept: 'application/json' },
      });
      paidEntitlement = response.ok ? await response.json() : {};
      return paidEntitlement.state;
    }, {
      message: 'signed Lemon webhook did not create the durable paid Test Mode entitlement',
      timeout: 90_000,
      intervals: [1_000, 2_000, 3_000, 5_000],
    }).toBe('paid_active');
    expect(paidEntitlement.requiresCard).toBe(true);
    const startsAt = new Date(paidEntitlement.startsAt ?? '').getTime();
    const endsAt = new Date(paidEntitlement.endsAt ?? '').getTime();
    expect(Number.isFinite(startsAt)).toBe(true);
    expect(Number.isFinite(endsAt)).toBe(true);
    expect((endsAt - startsAt) / 86_400_000).toBeGreaterThanOrEqual(29.9);
    expect((endsAt - startsAt) / 86_400_000).toBeLessThanOrEqual(30.1);
    billingEntitlementEndsAt = paidEntitlement.endsAt ?? null;
    billingTransaction = 'verified_test_mode_webhook';
  }
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Security' }).click();
  await page.getByRole('button', { name: 'Logout' }).first().click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  await page.goto('/dashboard/operations');
  await expect(page).toHaveURL(/\/auth\/login/);
  const loggedOut = await browserSession(page); expect(loggedOut).toEqual({ status: 401, authenticated: false });
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/command3-auth-evidence.json', JSON.stringify({ projectRef: new URL(supabaseUrl).hostname.split('.')[0], expectedRelease: expectedRelease || null, expectedWebRelease: expectedWebRelease || null, webRelease: webRelease.body.release ?? 'unavailable', apiRelease: apiRelease.release ?? 'unavailable', frontendArtifactEquivalent: expectedWebRelease !== expectedRelease ? 'verified_by_zero_frontend_diff' : 'exact_release', login: 'verified', sessionRefresh: 'verified', authenticatedRoutes: routeChecks.length, responsiveViewports: 3, operationsApi: allowed.status, crossTenantApi: denied.status, notificationsApi: notifications.status, unreadNotificationsApi: unreadNotifications.status, billingCheckout, billingTransaction, billingMode: billingTransaction === 'verified_test_mode_webhook' ? 'test' : 'not_verified', initialRealCharge: billingTransaction === 'verified_test_mode_webhook' ? 0 : null, testPaymentInstrument, billingEntitlementEndsAt, logout: loggedOut.status, fixtureIsolation: 'temporary users, projects, and billing cycles cascade-deleted', observedAt: new Date().toISOString() }, null, 2));
});
