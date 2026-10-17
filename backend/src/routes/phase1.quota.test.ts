import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import router from './phase1.js';
import type { AuthRequest } from '../middleware/auth.js';

test('quota routes distinguish unavailable evidence from exhausted capacity', async t => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']; const prior = keys.map(key => process.env[key]);
  process.env.SUPABASE_URL = 'http://127.0.0.1:49196'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-only';
  t.after(() => keys.forEach((key, index) => { if (prior[index] === undefined) delete process.env[key]; else process.env[key] = prior[index]; }));
  const originalFetch = globalThis.fetch, owner = '11111111-1111-4111-8111-111111111111';
  let mode = 'missing';
  t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input)); assert.equal(url.origin, 'http://127.0.0.1:49196');
    assert.equal(url.pathname, '/rest/v1/user_token_usage'); assert.equal(url.searchParams.get('user_id'), `eq.${owner}`);
    if (mode === 'missing') return Response.json(null);
    if (mode === 'outage') return Response.json({ message: 'PRIVATE_CANARY' }, { status: 503 });
    return Response.json({ user_id: owner, plan_tier: 'free', plan_budget_usd: mode === 'empty' ? 0 : 1.65,
      quota_period_start: `${new Date().toISOString().slice(0, 7)}-01`, input_tokens: 0, output_tokens: 0,
      spent_usd: 0, rollover_usd: 0, model_usage: {} });
  });
  const app = express(); app.use((req: AuthRequest, _res, next) => { req.userId = owner; next(); }); app.use(router);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.close(); await once(server, 'close'); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const request = (path: string) => originalFetch(`http://127.0.0.1:${address.port}${path}`);
  for (mode of ['missing', 'outage']) {
    for (const path of ['/quota-check', '/usage']) {
      const response = await request(path); assert.equal(response.status, 503);
      assert.ok(!(await response.text()).includes('PRIVATE_CANARY'));
    }
  }
  mode = 'empty'; assert.equal((await request('/quota-check')).status, 402);
  mode = 'valid'; assert.equal((await request('/quota-check')).status, 200);
});
