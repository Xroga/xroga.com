import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { SignJWT } from 'jose';
import { authMiddleware } from '../middleware/auth.js';
import { MemoryLeaseStore } from '../workers/leaseStore.js';
import { MemoryBrowserRunStore } from '../workers/browserRunStore.js';
import { createLocalBrowserRouter } from './localBrowser.js';

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';

test('local Chrome shares canonical ownership, turn fencing, cancellation and result storage', async t => {
  const env = {
    SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_JWT_SECRET: 'test-only-local-browser-signing-secret',
    SUPABASE_SERVICE_ROLE_KEY: '', REQUIRE_REMOTE_AUTH_CHECK: '0',
    XROGA_LOCAL_BROWSER_ALLOWED_USER_IDS: `${owner},${other}`,
    XROGA_LOCAL_BROWSER_VISION_PROBE: '',
    ZURELAY_DEEPSEEK_VISION_VERIFIED: '',
  };
  const before = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const tokenFor = (user: string) => new SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'HS256' })
    .setSubject(user).setAudience('authenticated').setIssuer(`${env.SUPABASE_URL}/auth/v1`).setExpirationTime('2m')
    .sign(new TextEncoder().encode(env.SUPABASE_JWT_SECRET));
  const [ownerToken, otherToken] = await Promise.all([tokenFor(owner), tokenFor(other)]);
  const runs = new MemoryBrowserRunStore();
  const leases = new MemoryLeaseStore();
  const received: Array<{ runId: string; idempotency: string; messages: unknown }> = [];
  const app = express();
  app.use(express.json());
  app.use(authMiddleware);
  let pluginRevoked = false;
  let pluginConfirmations = 0;
  const approvalId = '00000000-0000-4000-8000-000000000003';
  const receiptId = '00000000-0000-4000-8000-000000000004';
  app.use((req: import('./localBrowserDevice.js').BrowserDeviceRequest, _res, next) => {
    if (req.get('x-fixture-device') === '1') req.revalidateBrowserDevice = async () => !pluginRevoked;
    next();
  });
  app.use(createLocalBrowserRouter(() => ({ runs, leases }), async request => {
    await request.authority?.revalidate();
    assert.equal(request.modelId, 'deepseek_v4_1_flash_1017');
    assert.equal(request.platformCostCeiling, 3_000);
    assert.equal(request.body.stream, false);
    received.push({ runId: request.job.runId, idempotency: request.idempotencyKey, messages: request.body.messages });
    return { id: 'fixture-model', choices: [{ finish_reason: 'stop', message: { content: 'Read the catalog.' } }],
      usage: { prompt_tokens: 40, completion_tokens: 10, total_tokens: 50 } };
  }, {
    configured: () => true,
    discover: async (user, _query, context) => {
      assert.equal(user, owner);
      assert.equal(context?.userId, owner);
      return { sessionId: 'fixture-plugin-session', toolkits: [
        { toolkit: 'googlesheets', connected: true, noAuth: false },
        { toolkit: 'private_other_app', connected: false, noAuth: false },
      ], tools: [
        { slug: 'GOOGLESHEETS_LIST_ROWS', toolkit: 'googlesheets', risk: 'read', inputSchema: { type: 'object' } },
        { slug: 'GOOGLESHEETS_DELETE_ROW', toolkit: 'googlesheets', risk: 'destructive', inputSchema: {} },
        { slug: 'PRIVATE_OTHER_APP_LIST', toolkit: 'private_other_app', risk: 'read', inputSchema: {} },
      ] } as Awaited<ReturnType<typeof import('../services/integrations/composioClient.js').searchComposioTools>>;
    },
    prepare: async (user, data) => {
      assert.equal(user, owner);
      assert.equal(data.sessionId, 'fixture-plugin-session');
      assert.equal(data.toolSlug, 'GOOGLESHEETS_LIST_ROWS');
      return { needsConfirmation: true, confirmation: { id: approvalId, summary: 'Read rows',
        approval: { accountReference: 'fixture-user-connection' } } } as Awaited<ReturnType<typeof import('../services/integrations/composioClient.js').executeComposioReadTool>>;
    },
    confirm: async (context, id, expected) => {
      assert.equal(context.userId, owner);
      assert.equal(id, approvalId);
      assert.deepEqual(expected, { toolkit: 'googlesheets', toolSlug: 'GOOGLESHEETS_LIST_ROWS' });
      pluginConfirmations++;
      return { confirmation: { receipt: { id: receiptId } }, execution: {
        toolSlug: 'GOOGLESHEETS_LIST_ROWS', resultText: 'Verified fixture rows',
      } } as Awaited<ReturnType<typeof import('../services/integrations/businessActionConfirmations.js').confirmBusinessAction>>;
    },
    cancel: async () => { throw new Error('Unexpected cancellation'); },
  }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const send = (path: string, method = 'GET', data?: unknown, crossTenant = false, device = false) => fetch(`http://127.0.0.1:${address.port}${path}`, {
    method, headers: { 'content-type': 'application/json', authorization: `Bearer ${crossTenant ? otherToken : ownerToken}`, ...(device ? { 'x-fixture-device': '1' } : {}) },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  try {
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/session`)).status, 401);
    assert.deepEqual(await (await send('/session')).json(), { account: owner });
    process.env.XROGA_LOCAL_BROWSER_ALLOWED_USER_IDS = owner;
    assert.equal((await send('/session', 'GET', undefined, true)).status, 403);
    assert.equal((await send('/runs', 'POST', { goal: 'Denied', startUrl: 'https://example.com' }, true)).status, 403);
    process.env.XROGA_LOCAL_BROWSER_ALLOWED_USER_IDS = env.XROGA_LOCAL_BROWSER_ALLOWED_USER_IDS;
    const started = await send('/runs', 'POST', { goal: 'Compare items', startUrl: 'https://example.com/catalog' });
    assert.equal(started.status, 201);
    const { runId } = await started.json() as { runId: string };
    const path = `/runs/${runId}`;
    const request = { turn: 1, messages: [{ role: 'user', content: 'Read the catalog.' }] };
    assert.equal((await send(path, 'GET', undefined, true)).status, 404);
    assert.equal((await send(`${path}/turn`, 'POST', request, true)).status, 404);
    assert.equal((await send('/plugins/catalog')).status, 403);
    const pluginSearch = (device = true) => send(`${path}/plugin-search`, 'POST', { query: 'List spreadsheet rows' }, false, device);
    const pluginRead = (slug: string) => send(`${path}/plugin-read`, 'POST', { slug, arguments: {} }, false, true);
    const review = (run: string, crossTenant = false) =>
      send(`${run}/plugin-review`, 'POST', { approvalId, decision: 'approve' }, crossTenant, true);
    assert.equal((await pluginSearch(false)).status, 403);
    assert.equal((await pluginRead('GOOGLESHEETS_LIST_ROWS')).status, 403);
    const discovery = await pluginSearch();
    assert.equal(discovery.status, 200);
    assert.deepEqual((await discovery.json() as { tools: { slug: string }[] }).tools.map(item => item.slug), ['GOOGLESHEETS_LIST_ROWS']);
    assert.equal((await pluginSearch()).status, 409);
    assert.equal((await pluginRead('GOOGLESHEETS_DELETE_ROW')).status, 403);
    const read = await pluginRead('GOOGLESHEETS_LIST_ROWS');
    assert.equal(read.status, 200);
    assert.equal((await read.json() as { approval: { id: string } }).approval.id, approvalId);
    assert.equal(pluginConfirmations, 0);
    assert.equal((await review(path, true)).status, 404);
    const another = await send('/runs', 'POST', { goal: 'Unrelated run', startUrl: 'https://example.com' });
    assert.equal(another.status, 201);
    const { runId: anotherRun } = await another.json() as { runId: string };
    assert.equal((await review('/runs/' + anotherRun)).status, 409);
    pluginRevoked = true;
    assert.equal((await review(path)).status, 403);
    assert.equal(pluginConfirmations, 0);
    pluginRevoked = false;
    const approved = await review(path);
    assert.equal(approved.status, 200);
    assert.deepEqual(await approved.json(), { receiptId, result: 'Verified fixture rows' });
    assert.equal((await review(path)).status, 409);
    assert.equal(pluginConfirmations, 1);
    assert.deepEqual(await runs.listRecoverable(0, 10), []);
    assert.equal((await send(`${path}/turn`, 'POST', { ...request, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://example.com/private.png' } }] }] })).status, 400);
    assert.equal((await send(`${path}/turn`, 'POST', { ...request, messages: [{ role: 'user', content: 'Bearer example-secret-token' }] })).status, 400);
    assert.equal(received.length, 0);
    assert.equal((await send(`${path}/turn`, 'POST', request)).status, 200);
    assert.equal((await send(`${path}/turn`, 'POST', request)).status, 409);
    assert.equal((await send(path, 'DELETE')).status, 200);
    assert.equal((await send(`${path}/turn`, 'POST', { ...request, turn: 2 })).status, 409);
    const finished = await send(`${path}/finish`, 'POST', { status: 'completed', result: 'Late result' });
    assert.equal(finished.status, 409);
    assert.equal((await send(`${path}/finish`, 'POST', { status: 'cancelled' })).status, 200);
    const snapshot = await (await send(path)).json() as { status: string; result: unknown };
    assert.equal(snapshot.status, 'cancelled');
    assert.equal(snapshot.result, null);
    assert.deepEqual(received.map(item => item.runId), [runId]);

    const extended = await send('/runs', 'POST', { goal: 'Read the attached specification', startUrl: 'https://example.com/', attachmentCount: 1 });
    const accepted = await extended.json() as { runId: string; maxTurns: number; remainingMs: number };
    assert.ok(accepted.maxTurns > 12);
    assert.equal(accepted.remainingMs, 90 * 60_000);
    const longPath = `/runs/${accepted.runId}`;
    for (let turn = 1; turn <= 15; turn++) {
      assert.equal((await send(`${longPath}/turn`, 'POST', { ...request, turn })).status, 200);
    }
    assert.equal((await send(`${longPath}/resume`, 'POST', {}, true)).status, 404);
    const resumed = await (await send(`${longPath}/resume`, 'POST', {})).json() as { runId: string; turns: number };
    assert.equal(resumed.runId, accepted.runId);
    assert.equal(resumed.turns, 15);
    assert.equal((await send(`${longPath}/turn`, 'POST', { ...request, turn: 15 })).status, 409);
    assert.equal((await send(`${longPath}/turn`, 'POST', { ...request, turn: 16 })).status, 200);

    const probeRun = await (await send('/runs', 'POST', { goal: 'Inspect a synthetic image', startUrl: 'https://example.com/' })).json() as { runId: string };
    const probePath = `/runs/${probeRun.runId}/turn`;
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+VODsAAAAASUVORK5CYII=';
    const probe = { ...request, vision_probe_png: png, tools: [{ type: 'function',
      function: { name: 'snapshot', parameters: { type: 'object', properties: {} } } }] };
    assert.equal((await send(probePath, 'POST', probe)).status, 400);
    const hash = createHash('sha256').update(Buffer.from(png, 'base64')).digest('hex');
    process.env.XROGA_LOCAL_BROWSER_VISION_PROBE = `${probeRun.runId}:${hash}`;
    assert.equal((await send(probePath, 'POST', probe)).status, 400);
    process.env.ZURELAY_DEEPSEEK_VISION_VERIFIED = 'true';
    assert.equal((await send(probePath, 'POST', probe, true)).status, 404);
    assert.equal((await send(probePath, 'POST', { ...probe, vision_probe_png: png.replace('AAAB', 'AAAC') })).status, 400);
    assert.equal((await send(probePath, 'POST', { ...probe, max_tokens: 513 })).status, 400);
    assert.equal((await send(probePath, 'POST', probe)).status, 200);
    assert.deepEqual(received.at(-1)?.messages, [{ role: 'user', content: [
      { type: 'text', text: 'Read the catalog.' },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${png}`, detail: 'low' } },
    ] }]);
    assert.equal((await send(probePath, 'POST', probe)).status, 409);
    const savedProbe = await runs.load(owner, probeRun.runId);
    assert.ok(savedProbe);
    assert.ok(!JSON.stringify(savedProbe).includes(png));
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
