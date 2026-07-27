import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const backendUrl = process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:4000';
const run = randomUUID();
const password = `C3!${randomUUID()}aA9`;
const ownerEmail = `command3-owner-${run}@example.invalid`;
const outsiderEmail = `command3-outsider-${run}@example.invalid`;
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
let ownerId = ''; let outsiderId = ''; let ownerProjectId = ''; let outsiderProjectId = '';

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
  await page.getByLabel('Email').fill(ownerEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/(workspace|dashboard)/);
  const firstSession = await page.request.get('/api/session');
  expect(firstSession.status()).toBe(200); expect((await firstSession.json()).authenticated).toBe(true);
  await page.reload();
  const refreshedSession = await page.request.get('/api/session');
  expect(refreshedSession.status()).toBe(200); expect((await refreshedSession.json()).authenticated).toBe(true);
  await page.goto('/dashboard/operations');
  await expect(page.getByText(`command3-demo-owner-${run}`)).toBeVisible();
  expect(browserBearer).toMatch(/^Bearer /);
  const allowed = await fetch(`${backendUrl}/api/operations/products/${ownerProjectId}`, { headers: { Authorization: browserBearer } });
  const denied = await fetch(`${backendUrl}/api/operations/products/${outsiderProjectId}`, { headers: { Authorization: browserBearer } });
  expect(allowed.status).toBe(200); expect(denied.status).toBe(403);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Logout' }).first().click();
  await expect(page).toHaveURL(/\/auth\/login/);
  const loggedOut = await page.request.get('/api/session'); expect(loggedOut.status()).toBe(401);
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/command3-auth-evidence.json', JSON.stringify({ projectRef: new URL(supabaseUrl).hostname.split('.')[0], login: 'verified', sessionRefresh: 'verified', operationsApi: allowed.status, crossTenantApi: denied.status, logout: loggedOut.status(), fixtureIsolation: 'temporary users and projects cascade-deleted', observedAt: new Date().toISOString() }, null, 2));
});
