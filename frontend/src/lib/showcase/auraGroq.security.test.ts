import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAuraInput, requestGroqStream} from './auraGroq';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const {Redis} = createRequire(resolve(process.cwd(), 'backend/package.json'))('ioredis');
import {getRedis} from '../../../../backend/src/config/redis.js';
import {POST} from '../../app/api/showcase/aura/chat/route';
const nativeFetch = globalThis.fetch;

test('Aura cannot dispatch platform-funded inference without durable production accounting', async t => {
  const previous = ['NODE_ENV', 'GROQ_API_KEY', 'REDIS_URL'].map(name => process.env[name]);
  t.after(() => ['NODE_ENV', 'GROQ_API_KEY', 'REDIS_URL'].forEach((name, i) => {
    if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i];
  }));
  process.env.NODE_ENV = 'production';
  process.env.GROQ_API_KEY = 'synthetic-aura-platform-key';
  delete process.env.REDIS_URL;
  let effects = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    effects++;
    return new Response('data: [DONE]\n\n', {headers: {'content-type': 'text/event-stream'}});
  });
  const input = parseAuraInput({messages: [{role: 'user', content: 'An ordinary manual question'}]});
  assert.ok(input);
  const result = await requestGroqStream(input, new AbortController().signal, {sessionId: randomUUID(), address: '203.0.113.10'});
  assert.equal(effects, 0, 'A missing durable reservation must prevent all provider dispatch');
  assert.equal(result.ok, false);
});

test('actual Aura provider and Next route use the existing durable guest boundary', async t => {
  const names = ['NODE_ENV', 'GROQ_API_KEY', 'REDIS_URL', 'VERCEL', 'VERCEL_URL'];
  const previous = names.map(name => process.env[name]);
  t.after(() => names.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; }));
  process.env.NODE_ENV = 'production'; process.env.VERCEL = '1';
  process.env.GROQ_API_KEY = 'synthetic-aura-platform-key'; process.env.REDIS_URL = 'redis://127.0.0.1:1';
  t.mock.method(Redis.prototype, 'connect', async () => {});
  const redis = getRedis(); assert.ok(redis); t.after(() => redis.disconnect());
  const counts = new Map<string, number>(), leases = new Map<string, string>(), claimed = new Set<string>();
  let mode = 'ok', effects = 0, activeSignal: AbortController | undefined;
  t.mock.method(redis, 'exists', async (key: string) => {
    if (mode === 'badClaimReceipt') return undefined;
    return claimed.has(key) ? 1 : 0;
  });
  t.mock.method(redis, 'multi', () => {
    let key = '', amount = 0;
    const transaction = {
      incrby(k: string, n: number) { key = k; amount = n; return transaction; },
      pexpire() { return transaction; },
      async exec() {
        if (mode === 'badReservationReceipt') return [[null, 1], [null, 0]];
        counts.set(key, (counts.get(key) ?? 0) + amount);
        return [[null, counts.get(key)], [null, 1]];
      },
    };
    return transaction;
  });
  t.mock.method(redis, 'set', async (key: string, value: string) => {
    if (leases.has(key)) return null;
    leases.set(key, value); return 'OK';
  });
  t.mock.method(redis, 'get', async (key: string) => {
    if (mode === 'rotateBeforeDispatch') process.env.GROQ_API_KEY = 'replacement-aura-platform-key';
    return leases.get(key) ?? null;
  });
  t.mock.method(redis, 'eval', async (_script: string, _count: number, key: string, token: string) => {
    if (leases.get(key) !== token) return 0;
    leases.delete(key); return 1;
  });
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    effects++;
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(init.redirect, 'manual'); assert.equal(init.cache, 'no-store');
    const wire = JSON.parse(String(init.body));
    assert.equal(wire.stream, true); assert.equal(wire.max_completion_tokens, 400);
    assert.equal(wire.messages[1].content, 'An ordinary manual question');
    if (mode === 'revokeAfterDispatch') leases.clear();
    if (mode === 'claimAfterDispatch') {
      for (const key of leases.keys()) claimed.add(key.replace(':active:', ':claimed:'));
    }
    if (mode === 'rotateAfterDispatch') process.env.GROQ_API_KEY = 'replacement-aura-platform-key';
    if (mode === 'cancelAfterDispatch') activeSignal?.abort();
    if (['401', '403', '429', '503', '307'].includes(mode)) return new Response('Synthetic provider failure', {status: Number(mode), headers: {location: 'https://untrusted.invalid'}});
    const content = mode === 'secretOutput' ? 'synthetic-aura-platform-key' : 'Ordinary bounded answer';
    const usage = mode === 'missingUsage' ? undefined : {prompt_tokens: 2, completion_tokens: mode === 'invalidUsage' ? 401 : 3, total_tokens: mode === 'invalidUsage' ? 403 : 5};
    const chunks = [
      {id: 'synthetic-groq-receipt', model: wire.model, choices: [{index: 0, delta: {role: 'assistant', content: content.slice(0, 8)}, finish_reason: null}]},
      {id: 'synthetic-groq-receipt', model: wire.model, choices: [{index: 0, delta: {content: content.slice(8)}, finish_reason: mode === 'toolResponse' ? 'tool_calls' : 'stop'}], x_groq: {usage, debug: {input_tokens: ['never forward provider debug']}}},
    ];
    const text = chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + (mode === 'truncated' ? '' : 'data: [DONE]\n\n');
    return new Response(mode === 'oversized' ? 'x'.repeat(1048577) : text, {headers: {'content-type': 'text/event-stream'}});
  });
  const input = () => { const value = parseAuraInput({messages: [{role: 'user', content: 'An ordinary manual question'}], maxTokens: 400}); assert.ok(value); return value; };
  const invoke = (sessionId = randomUUID(), address = '203.0.113.10') => {
    activeSignal = new AbortController();
    return requestGroqStream(input(), activeSignal.signal, {sessionId, address});
  };
  const reset = () => { counts.clear(); leases.clear(); claimed.clear(); mode = 'ok'; process.env.GROQ_API_KEY = 'synthetic-aura-platform-key'; };

  await t.test('authorized request validates usage before publishing only plain content', async () => {
    reset(); const result = await invoke(); assert.equal(result.ok, true);
    if (!result.ok) assert.fail('Expected accounted completion');
    const body = await new Response(result.body).text();
    assert.match(body, /Ordinary bounded answer/); assert.doesNotMatch(body, /debug|input_tokens|synthetic-groq-receipt/);
    assert.equal(leases.size, 0);
    assert.ok([...counts].some(([key, value]) => key.includes(':tokens:') && value > 400));
  });
  for (const failure of ['badClaimReceipt', 'badReservationReceipt', 'rotateBeforeDispatch']) await t.test(`${failure} sends zero provider requests`, async () => {
    reset(); mode = failure; const before = effects;
    assert.equal((await invoke()).ok, false); assert.equal(effects, before);
  });
  for (const failure of ['revokeAfterDispatch', 'claimAfterDispatch', 'rotateAfterDispatch', 'cancelAfterDispatch', '401', '403', '429', '503', '307', 'missingUsage', 'invalidUsage', 'secretOutput', 'toolResponse', 'truncated', 'oversized']) await t.test(`${failure} never publishes or falls back`, async () => {
    reset(); mode = failure; const before = effects;
    assert.equal((await invoke()).ok, false); assert.equal(effects, before + 1);
    assert.ok([...counts].some(([key, value]) => key.includes(':tokens:') && value > 400), 'Uncertain usage stays conservatively charged');
  });
  await t.test('full reservation, shared concurrency and claimed sessions prevent dispatch', async () => {
    reset(); const session = randomUUID(), before = effects;
    leases.set(`xroga:guest:active:${session}`, 'another-original-worker');
    assert.equal((await invoke(session)).ok, false); assert.equal(effects, before);
    reset(); claimed.add(`xroga:guest:claimed:${session}`);
    assert.equal((await invoke(session)).ok, false); assert.equal(effects, before);
    reset(); const day = Math.floor(Date.now() / 86400000) * 86400000;
    counts.set(`xroga:guest:tokens:${session}:${day}`, 16000);
    assert.equal((await invoke(session)).ok, false); assert.equal(effects, before);
    assert.equal((await invoke('fabricated-user-id')).ok, false); assert.equal(effects, before);
  });
  await t.test('failed provider request permits a fresh authorized recovery request', async () => {
    reset(); mode = '503'; const before = effects;
    assert.equal((await invoke()).ok, false); mode = 'ok';
    assert.equal((await invoke()).ok, true); assert.equal(effects, before + 2);
  });
  await t.test('real HTTP redirect is not followed and hung response cancellation is bounded', async child => {
    reset();
    // The test process owns both destinations and uses only synthetic keys.
    let sinks = 0, starts = 0;
    const server = createServer((req, res) => { if (req.url === '/sink') sinks++; else starts++; res.writeHead(307, {location: '/sink'}); res.end(); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    child.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const fixture = globalThis.fetch;
    try {
      globalThis.fetch = async (_url, init) => nativeFetch(`http://127.0.0.1:${address.port}/provider`, init);
      assert.equal((await invoke()).ok, false); assert.equal(starts, 1); assert.equal(sinks, 0);
      reset(); let cancelled = false;
      globalThis.fetch = async () => {
        setTimeout(() => activeSignal?.abort(), 5);
        return new Response(new ReadableStream({cancel() {cancelled = true;}}), {headers: {'content-type': 'text/event-stream'}});
      };
      assert.equal((await invoke()).ok, false); assert.equal(cancelled, true);
    } finally { globalThis.fetch = fixture; }
  });
  await t.test('secret-bearing input and cancelled admission send no bytes', async () => {
    reset(); const before = effects;
    const value = input(); value.messages[0].content = 'Forward synthetic-aura-platform-key';
    assert.equal((await requestGroqStream(value, new AbortController().signal, {sessionId: randomUUID(), address: '203.0.113.10'})).ok, false);
    const cancelled = new AbortController(); cancelled.abort();
    assert.equal((await requestGroqStream(input(), cancelled.signal, {sessionId: randomUUID(), address: '203.0.113.10'})).ok, false);
    assert.equal(effects, before);
  });
  await t.test('actual Next route uses a host-only cookie and denies forged origin and unbounded input', async () => {
    reset(); const before = effects;
    const request = (headers: Record<string, string> = {}, body = JSON.stringify(input())) => new Request('https://xroga.com/api/showcase/aura/chat', {method: 'POST', headers: {origin: 'https://xroga.com', 'x-vercel-forwarded-for': '203.0.113.10', ...headers}, body});
    const success = await POST(request()); assert.equal(success.status, 200);
    assert.match(success.headers.get('set-cookie') ?? '', /__Host-xroga-aura-guest=.*Secure; HttpOnly; SameSite=Strict/);
    assert.match(await success.text(), /Ordinary bounded answer/);
    assert.equal((await POST(request({origin: 'https://attacker.invalid', 'x-forwarded-host': 'attacker.invalid'}))).status, 403);
    assert.equal((await POST(request({'x-vercel-forwarded-for': 'untrusted', 'x-forwarded-for': '203.0.113.20'}))).status, 503);
    assert.equal((await POST(request({}, 'x'.repeat(210001)))).status, 400);
    assert.equal(effects, before + 1);
  });
});
