import assert from 'node:assert/strict';
import { createHash, X509Certificate } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:https';
import { appendFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { SignJWT } from 'jose';
import { chromium, expect } from '@playwright/test';
import { createBrowserDeviceRouter, createLocalBrowserAuth } from '../../backend/src/routes/localBrowserDevice.ts';
import { createLocalBrowserRouter } from '../../backend/src/routes/localBrowser.ts';
import { MemoryBrowserRunStore } from '../../backend/src/workers/browserRunStore.ts';
import { MemoryLeaseStore } from '../../backend/src/workers/leaseStore.ts';

const [pgModule, chrome, parent, tlsKey, tlsCert, extensionPath] = process.argv.slice(2);
assert.ok(pgModule && chrome && parent && tlsKey && tlsCert && extensionPath);
const manifest = JSON.parse(await readFile(join(extensionPath, 'manifest.json'), 'utf8'));
const expectedId = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32)
  .replace(/[0-9a-f]/g, digit => String.fromCharCode(97 + parseInt(digit, 16)));
const { PGlite } = await import(pathToFileURL(pgModule));
const db = await PGlite.create();
const [owner, other] = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
let activeOwner = owner;
let extensionId;
const turns = [];
const workspaces = [];
const requests = [];
const proof = 'Violet telescope serial XR-649';
const artifactDir = process.env.XROGA_BROWSER_QA_SCREENSHOTS;
const workspaceOrigin = 'https://xroga.com';
const apiOrigin = 'https://api.xroga.com';
const site = 'https://example.com';
const profile = await mkdtemp(join(parent, 'xr-device-'));
async function checkpoint(message) {
  console.log(message);
  if (process.env.XROGA_CLEANUP_JOB_ROOT) {
    await appendFile(join(process.env.XROGA_CLEANUP_JOB_ROOT, 'chrome-device-acceptance.log'), message + '\n');
  }
}
Object.assign(process.env, {
  SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_JWT_SECRET: 'local-device-browser-fixture',
  SUPABASE_SERVICE_ROLE_KEY: '', REQUIRE_REMOTE_AUTH_CHECK: '0', XROGA_LOCAL_BROWSER_ALLOWED_USER_IDS: owner + ',' + other,
  COMPOSIO_API_KEY: '',
});
await db.exec('create schema auth; create table auth.users (id uuid primary key); create role anon; create role authenticated; create role service_role;');
await db.query('insert into auth.users values ($1), ($2)', [owner, other]);
await db.exec(await readFile(new URL('../../supabase/migrations/20261108181114_local_browser_device_sessions.sql', import.meta.url), 'utf8'));
const database = () => ({
  async query(statement, args) {
    const result = await db.query(statement, args);
    return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
  },
});
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  res.once('finish', () => requests.push({ method: req.method, path: req.path, status: res.statusCode }));
  next();
});
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin === workspaceOrigin || origin === 'chrome-extension://' + extensionId) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
const userToken = account => new SignJWT({ role: 'authenticated' }).setSubject(account)
  .setProtectedHeader({ alg: 'HS256' }).setAudience('authenticated').setIssuer('http://127.0.0.1:1/auth/v1')
  .setExpirationTime('10m').sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET));
app.get('/workspace', async (_req, res) => {
  const account = activeOwner;
  const token = await userToken(account);
  workspaces.push(account);
  const lines = [
    "<title>Local fixture sign-in</title><p id='status'>Connecting</p><script>",
    "const q = new URLSearchParams(location.search);",
    "const port = chrome.runtime.connect(q.get('browserExtension'), { name: 'xroga-browser-v1' });",
    "port.onMessage.addListener(async message => {",
    "if (message.type === 'paired') document.querySelector('#status').textContent = 'Connected';",
    "if (message.type !== 'request' || message.op !== 'authorize-device') return;",
    "const response = await fetch('https://api.xroga.com/api/browser/local/device/authorize', {",
    "method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + " + JSON.stringify(token) + " },",
    "body: JSON.stringify({ extensionId: q.get('browserExtension'), challenge: message.value.body }),",
    "}); port.postMessage({ type: 'result', id: message.id, ok: response.ok, value: await response.json() }); });",
    "port.postMessage({ type: 'pair', nonce: q.get('browserPair'), account: " + JSON.stringify(account) + ", device: true });",
    "</script>",
  ];
  res.type('html').send(lines.join('\n'));
});
app.get('/catalog', (_req, res) => res.type('html').send(
  '<title>Unfamiliar Catalog</title><main><h1>Catalog</h1><button>Reveal serial</button><p role="status"></p></main>' +
  '<script>document.querySelector("button").onclick=()=>{document.body.dataset.actionVisibility=document.visibilityState;document.querySelector("p").textContent=' + JSON.stringify(proof) + ';};</script>',
));
app.use('/api/browser/local/device', createBrowserDeviceRouter(database, () => extensionId));
const runs = new MemoryBrowserRunStore();
const leases = new MemoryLeaseStore();
app.use('/api/browser/local', createLocalBrowserAuth(database, () => extensionId),
  createLocalBrowserRouter(() => ({ runs, leases }), async request => {
    await request.authority.revalidate();
    assert.ok(request.body.tools.some(item => item.function.name === 'snapshot'));
    const observed = JSON.stringify(request.body.messages).includes(proof);
    turns.push({ account: request.authority.context.userId, observed });
    const seesButton = request.body.messages.some(message => message.role === 'tool' && JSON.stringify(message.content).includes('Reveal serial'));
    const name = observed ? 'done' : seesButton ? 'click' : 'snapshot';
    // This fixture uses a separate panel tab. Give Chrome time to foreground the task tab as a real side panel would.
    if (name === 'click' || name === 'done') await new Promise(resolve => setTimeout(resolve, 600));
    const args = observed ? { outcome: 'success', summary: 'Verified catalog: ' + proof }
      : seesButton ? { target: { role: 'button', name: 'Reveal serial' }, expect: { text: proof } } : {};
    const message = { tool_calls: [{ id: 'tool-' + turns.length, type: 'function', function: { name, arguments: JSON.stringify(args) } }] };
    return { id: 'fixture-' + turns.length, choices: [{ message, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 80, completion_tokens: 15, total_tokens: 95 } };
  }),
);
const certificate = await readFile(tlsCert);
const fixtureFingerprint = createHash('sha256').update(new X509Certificate(certificate).publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
const server = createServer({ key: await readFile(tlsKey), cert: certificate }, app);
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const port = server.address().port;
let browser;
async function open() {
  browser = await chromium.launchPersistentContext(profile, {
    executablePath: chrome,
    headless: false,
    timeout: 20_000,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      '--enable-unsafe-extension-debugging', '--disable-background-networking',
      '--no-first-run', '--no-default-browser-check', '--no-proxy-server', '--ignore-certificate-errors-spki-list=' + fixtureFingerprint,
      '--host-resolver-rules=' + [site, workspaceOrigin, apiOrigin].map(url => 'MAP ' + new URL(url).hostname + ' 127.0.0.1:' + port).join(', ') + ', MAP * ~NOTFOUND',
    ],
  });
  const cdp = await browser.browser().newBrowserCDPSession();
  const { id: loaded } = await cdp.send('Extensions.loadUnpacked', { path: resolve(extensionPath) });
  assert.equal(loaded, expectedId);
  extensionId = loaded;

  const siteTab = await browser.newPage();
  await siteTab.goto(site + '/catalog');
  const { targetInfos } = await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] });
  const target = targetInfos.find(item => item.url === siteTab.url());
  assert.ok(target);
  await cdp.send('Extensions.triggerAction', { id: extensionId, targetId: target.targetId });
  const panel = await browser.newPage();
  panel.setDefaultTimeout(12_000);
  await siteTab.bringToFront();
  await panel.goto('chrome-extension://' + extensionId + '/sidepanel.html');
  return panel;
}
const closeWorkspaceTabs = async () => {
  const pages = browser.pages().filter(page => page.url().startsWith(workspaceOrigin + '/workspace'));
  await Promise.all(pages.map(page => page.close()));
};
const signedIn = panel => panel.getByRole('status').filter({ hasText: 'Signed in to Xroga' }).waitFor({ timeout: 25_000 });
const run = async (panel, text) => {
  await panel.locator('textarea').fill(text);
  const tab = browser.pages().find(page => page.url().startsWith(site));
  await tab?.bringToFront();
  await panel.locator('textarea').press('Enter');
  await tab?.bringToFront();
  try {
    assert.ok(tab);
    await expect(tab.getByRole('status')).toHaveText(proof, { timeout: 15_000 });
    await expect(tab.locator('body')).toHaveAttribute('data-action-visibility', 'visible');
    await tab.locator('[data-xroga-action-point]').waitFor({ state: 'attached', timeout: 3_000 });
    if (artifactDir) await tab.screenshot({ path: join(artifactDir, 'chrome-action-pointer.png') });
    await panel.getByText('Verified catalog: ' + proof, { exact: true }).waitFor({ timeout: 24_000 });
  } catch (error) {
    console.error(JSON.stringify({ turns, requests, panel: (await panel.locator('body').innerText()).slice(-1800) }));
    throw error;
  }
};
try {
  let panel = await open();
  await signedIn(panel);
  await closeWorkspaceTabs();
  await checkpoint('Chrome enrolled and all Workspace tabs closed');
  await run(panel, 'Read the catalog and report its serial.');
  assert.deepEqual(workspaces, [owner]);
  assert.ok(turns.some(turn => turn.account === owner && turn.observed));
  await checkpoint('Direct Chrome click exposed the observed serial and showed the Xroga action pointer');
  if (artifactDir) await panel.screenshot({ path: join(artifactDir, 'chrome-task-result.png') });
  await browser.close();
  await checkpoint('Chrome closed before restart');
  panel = await open();
  await signedIn(panel);
  await closeWorkspaceTabs();
  assert.deepEqual(workspaces, [owner], 'A full Chrome restart must not open Workspace again');
  await checkpoint('Full Chrome restart restored the direct session');
  await panel.getByRole('button', { name: 'Plugins', exact: true }).click();
  await expect(panel.getByRole('dialog', { name: 'Plugins' })).toBeVisible();
  await expect(panel.getByRole('searchbox', { name: 'Search plugins' })).toBeVisible();
  await expect(panel.getByRole('alert')).toContainText('not configured');
  if (artifactDir) await panel.screenshot({ path: join(artifactDir, 'chrome-plugins-unavailable.png') });
  await panel.keyboard.press('Escape');
  await panel.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect.poll(async () => (await db.query('select count(*)::int as n from public.local_browser_device_sessions')).rows[0].n).toBe(0);
  await checkpoint('Side panel sign-out revoked the device in the database');
  activeOwner = other;
  // Signing out reloads the extension worker. Reopen its panel in the same Chrome profile.
  await panel.waitForEvent('close', { timeout: 1_500 }).catch(() => undefined);
  panel = await browser.newPage();
  panel.setDefaultTimeout(12_000);
  const panelUrl = 'chrome-extension://' + extensionId + '/sidepanel.html';
  const connect = panel.getByRole('button', { name: 'Connect Xroga Workspace' });
  // The unpacked extension can be briefly unavailable while Chrome reloads its service worker.
  await expect(async () => {
    await panel.goto(panelUrl, { timeout: 3_000 });
    await expect(connect).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 12_000, intervals: [250, 500, 1_000] });
  await connect.click();
  await signedIn(panel);
  await closeWorkspaceTabs();
  await panel.getByRole('button', { name: 'History', exact: true }).click();
  await expect(panel.getByText('No conversations yet.', { exact: true })).toBeVisible();
  await expect(panel.getByText('Read the catalog and report its serial.', { exact: true })).toHaveCount(0);
  await checkpoint(JSON.stringify({ passed: true, extensionId, workspaceOpenedFor: workspaces, turns, model: 'deterministic fixture' }));
} catch (error) {
  await checkpoint(String(error));
  throw error;
} finally {
  await browser?.close();
  server.close();
  await db.close();
  assert.ok(resolve(profile).startsWith(resolve(parent) + '\\') || resolve(profile).startsWith(resolve(parent) + '/'));
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
