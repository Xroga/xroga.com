import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTenantContext } from '../security/tenantContext.js';
import { getCachedResponse, setCachedResponse, tenantResponseCacheKey } from './responseCache.js';

test('inactive cache validates bounded typed reads and exact durable write receipts', async t => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']; const prior = keys.map(key => process.env[key]);
  process.env.SUPABASE_URL = 'http://127.0.0.1:49198'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-only';
  t.after(() => keys.forEach((key, index) => { if (prior[index] === undefined) delete process.env[key]; else process.env[key] = prior[index]; }));
  const owner = createTenantContext({ userId: '11111111-1111-4111-8111-111111111111', via: 'remote_getuser' });
  const key = tenantResponseCacheKey('prompt', owner), future = new Date(Date.now() + 60_000).toISOString();
  let read: unknown = { cache_key: key, prompt_hash: key, response_text: 'answer', ttl_expires_at: future };
  let mode = 'ok', calls = 0;
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input)); assert.equal(url.origin, 'http://127.0.0.1:49198'); assert.equal(url.pathname, '/rest/v1/response_cache'); calls++;
    if (mode === 'transport') throw new Error('PRIVATE_CANARY');
    if (mode === 'error') return Response.json({ message: 'PRIVATE_CANARY' }, { status: 400 });
    if ((init?.method ?? 'GET') === 'GET') {
      assert.equal(url.searchParams.get('cache_key'), `eq.${key}`); return Response.json(read);
    }
    assert.equal(init?.method, 'POST');
    assert.equal(url.searchParams.get('on_conflict'), 'cache_key');
    const receipt = JSON.parse(String(init?.body)); assert.equal(receipt.cache_key, key); assert.equal(receipt.prompt_hash, key);
    if (mode === 'missing') return Response.json(null);
    if (mode === 'wrong-key') receipt.cache_key = 'foreign';
    if (mode === 'wrong-hash') receipt.prompt_hash = 'foreign';
    if (mode === 'wrong-text') receipt.response_text = 'other';
    if (mode === 'wrong-category') receipt.feature_category = 'other';
    if (mode === 'wrong-expiry') receipt.ttl_expires_at = future;
    return Response.json(receipt);
  });
  assert.equal(await getCachedResponse('prompt', owner), 'answer');
  const valid = read as Record<string, unknown>;
  for (read of [null, { ...valid, cache_key: 'foreign' }, { ...valid, prompt_hash: 'foreign' },
    { ...valid, response_text: {} }, { ...valid, response_text: 'é'.repeat(524289) },
    { ...valid, ttl_expires_at: null }, { ...valid, ttl_expires_at: 'bad' },
    { ...valid, ttl_expires_at: new Date(0).toISOString() }, { ...valid, ttl_expires_at: '2999-01-01T00:00:00Z' }]) {
    assert.equal(await getCachedResponse('prompt', owner), null);
  }
  assert.equal(await setCachedResponse('prompt', 'answer', 'fixture', owner), true);
  for (mode of ['missing', 'wrong-key', 'wrong-hash', 'wrong-text', 'wrong-category', 'wrong-expiry', 'error', 'transport']) {
    assert.equal(await setCachedResponse('prompt', 'answer', 'fixture', owner), false, mode);
  }
  mode = 'error'; read = valid; assert.equal(await getCachedResponse('prompt', owner), null);
  const before: number = calls;
  assert.equal(await setCachedResponse('prompt', {} as string, 'fixture', owner), false);
  assert.equal(await setCachedResponse('prompt', 'é'.repeat(524289), 'fixture', owner), false);
  assert.equal(await setCachedResponse(' ', 'answer', 'fixture', owner), false);
  assert.equal(await setCachedResponse('prompt', 'answer', 'x'.repeat(129), owner), false);
  assert.equal(await getCachedResponse(' ', owner), null); assert.equal(calls, before);
});
