import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import voice from './voice.js';
import {createTenantContext} from '../security/tenantContext.js';
import {FREE_VOICE_MODEL} from '../ai/voiceBudget.js';

function wav(silent = false) {
  const audio = Buffer.alloc(44 + 44100);
  audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8);
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(22050, 24); audio.writeUInt32LE(44100, 28);
  audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(44100, 40);
  if (!silent) for (let i = 44; i < audio.length; i += 2) audio.writeInt16LE(3000, i);
  return audio;
}

test('free speech route preserves original actor, credential, reservation and publication boundaries', async t => {
  const names = ['NODE_ENV', 'CLOUDFLARE_VOICE_ACCOUNT_ID', 'CLOUDFLARE_VOICE_API_TOKEN', 'CLOUDFLARE_VOICE_FREE_PLAN_CONFIRMED', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const before = names.map(name => process.env[name]);
  t.after(() => names.forEach((name, index) => {if (before[index] === undefined) delete process.env[name]; else process.env[name] = before[index];}));
  const owner = randomUUID(), context = createTenantContext({userId: owner, via: 'remote_getuser'}), account = 'a'.repeat(32), token = 'synthetic-cloudflare-voice-token';
  process.env.NODE_ENV = 'production'; process.env.SUPABASE_URL = 'http://127.0.0.1:55439'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-only';
  let actor: unknown = context, userId = owner, mode = 'ok', dispatches = 0, usageWrites = 0;
  let response: express.Response | undefined;
  const events: string[] = [], holds = new Map<string, Record<string, unknown>>(), releases: Record<string, unknown>[] = [];
  const app = express();
  app.use((req, res, next) => {response = res; Object.assign(req, {userId, tenantContext: actor}); next();}); app.use('/voice', voice);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`, originalFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input)); if (url.origin === base) return originalFetch(input, init);
    if (url.origin === process.env.SUPABASE_URL) {
      const body = JSON.parse(String(init?.body));
      if (url.pathname.endsWith('/reserve_xroga_provider_budget')) {
        events.push('reserve'); assert.equal(body.p_user_id, owner); assert.equal(body.p_estimated_input_tokens, 0); assert.equal(body.p_maximum_output_tokens, 0);
        if (mode === 'reservationDenied') return Response.json({message: 'Synthetic denied'}, {status: 400});
        const row = {id: randomUUID(), user_id: owner, status: 'reserved', internal_route: body.p_internal_route, idempotency_key: body.p_idempotency_key,
          price_version: body.p_price_version, purpose: body.p_purpose, estimated_input_tokens: 0, maximum_output_tokens: 0, reserved_micro_usd: body.p_reservation_micro_usd};
        holds.set(row.id, row);
        if (mode === 'wrongOwnerHold') return Response.json({...row, user_id: randomUUID()});
        if (mode === 'rotateAtReservation') process.env.CLOUDFLARE_VOICE_API_TOKEN = 'rotated-synthetic-token';
        if (mode === 'cancelAtReservation') {response?.destroy(); await new Promise<void>(resolve => setImmediate(resolve));}
        return Response.json(row);
      }
      if (url.pathname === '/rest/v1/production_audit_log') {
        events.push('audit:' + body.outcome);
        if (mode === 'admissionAuditDenied' || mode === 'completedAuditDenied' && body.outcome === 'COMPLETED') return Response.json({message: 'Synthetic denied'}, {status: 400});
        return Response.json(body);
      }
      if (url.pathname.endsWith('/settle_xroga_provider_budget')) {
        events.push('settle'); assert.equal(body.p_actual_micro_usd, 0);
        if (mode === 'settlementDenied') return Response.json({message: 'Synthetic denied'}, {status: 400});
        const row = holds.get(body.p_reservation_id); assert.ok(row);
        if (mode === 'cancelAtSettlement') {response?.destroy(); await new Promise<void>(resolve => setImmediate(resolve));}
        return Response.json({...row, status: 'settled', settled_micro_usd: mode === 'wrongSettlement' ? 1 : 0,
          provider_request_id: body.p_provider_request_id, actual_input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_tokens: 0, tool_calls: 0, search_calls: 0});
      }
      if (url.pathname.endsWith('/record_ai_usage_atomic')) {
        events.push('usage'); usageWrites++;
        if (mode === 'usageDenied') return Response.json({message: 'Synthetic denied'}, {status: 400});
        return Response.json({userId: owner, receiptId: body.p_receipt_id, modelId: body.p_model_id, poolRole: body.p_pool_role,
          inputTokens: 0, outputTokens: 0, costUsd: 0, replayed: false, ledgerId: '1', period: '2026-10-01', usage: {user_id: owner}});
      }
      if (url.pathname.endsWith('/release_xroga_provider_budget')) {releases.push(body); return Response.json(null);}
      throw new Error('Unexpected database request');
    }
    assert.equal(url.href, `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${FREE_VOICE_MODEL}`);
    assert.equal(init?.redirect, 'manual'); assert.ok(init?.signal);
    assert.equal(new Headers(init.headers).get('authorization'), `Bearer ${token}`);
    const body = JSON.parse(String(init.body)); assert.equal(body.task, 'transcribe'); assert.equal(body.vad_filter, true);
    assert.equal(body.condition_on_previous_text, false); assert.equal(body.language, undefined);
    assert.deepEqual(Buffer.from(body.audio, 'base64'), wav()); dispatches++; events.push('provider');
    if (mode === 'redirect') return new Response(null, {status: 307, headers: {location: 'https://untrusted.invalid'}});
    if (['401', '403', '429', '503'].includes(mode)) return Response.json({error: 'PRIVATE_PROVIDER_MESSAGE'}, {status: Number(mode)});
    if (mode === 'rotateAfterDispatch') process.env.CLOUDFLARE_VOICE_API_TOKEN = 'rotated-synthetic-token';
    if (mode === 'revokeFreePlan') process.env.CLOUDFLARE_VOICE_FREE_PLAN_CONFIRMED = 'false';
    if (mode === 'hungProvider') {response?.destroy(); return new Promise<Response>(() => {});}
    if (mode === 'malformed') return new Response('bad-json');
    if (mode === 'oversized') return new Response('x'.repeat(65537));
    return Response.json({success: true, errors: [], result: {text: mode === 'empty' ? '' : mode === 'secret' ? token : 'یہ میرا کام ہے। Build a website.',
      transcription_info: {duration: mode === 'wrongDuration' ? 100 : 1, language: 'ur'}}}, {headers: mode === 'missingRequestId' ? {} : {'cf-ray': '0123456789abcdef-LHR'}});
  });
  function reset(value = 'ok') {
    mode = value; dispatches = 0; usageWrites = 0; events.length = 0; releases.length = 0; actor = context; userId = owner;
    process.env.CLOUDFLARE_VOICE_ACCOUNT_ID = account; process.env.CLOUDFLARE_VOICE_API_TOKEN = token; process.env.CLOUDFLARE_VOICE_FREE_PLAN_CONFIRMED = 'true';
  }
  const post = (audio = wav()) => originalFetch(base + '/voice/transcribe-free', {method: 'POST', headers: {'content-type': 'audio/wav'}, body: audio});
  await t.test('valid free receipt settles and persists zero cost before one editable transcript', async () => {
    reset(); const result = await post(); assert.equal(result.status, 200); assert.equal((await result.json() as {provider: string}).provider, 'cloudflare-free');
    assert.deepEqual(events, ['reserve', 'audit:ADMITTED', 'provider', 'settle', 'usage', 'audit:COMPLETED']); assert.equal(dispatches, 1); assert.equal(usageWrites, 1);
  });
  await t.test('raw, fabricated and foreign actors cannot dispatch', async () => {
    for (const value of [undefined, {...context}, createTenantContext({userId: randomUUID(), via: 'remote_getuser'})]) {
      reset(); actor = value; assert.notEqual((await post()).status, 200); assert.equal(dispatches, 0);
    }
  });
  await t.test('unconfirmed free plan, malformed account and absent credential cannot dispatch', async () => {
    for (const [name, value] of [['CLOUDFLARE_VOICE_FREE_PLAN_CONFIRMED', 'false'], ['CLOUDFLARE_VOICE_ACCOUNT_ID', '../other'], ['CLOUDFLARE_VOICE_API_TOKEN', '']]) {
      reset(); process.env[name] = value; assert.notEqual((await post()).status, 200); assert.equal(dispatches, 0);
    }
  });
  for (const value of ['reservationDenied', 'wrongOwnerHold', 'rotateAtReservation', 'admissionAuditDenied']) await t.test(value + ' sends no audio', async () => {
    reset(value); assert.notEqual((await post()).status, 200); assert.equal(dispatches, 0);
  });
  for (const value of ['401', '403', '429', '503', 'redirect', 'malformed', 'oversized', 'rotateAfterDispatch', 'revokeFreePlan', 'wrongDuration', 'missingRequestId', 'settlementDenied', 'wrongSettlement', 'usageDenied', 'completedAuditDenied', 'empty', 'secret']) await t.test(value + ' cannot publish or use paid fallback', async () => {
    reset(value); const result = await post(); assert.notEqual(result.status, 200); assert.equal(dispatches, 1); assert.doesNotMatch(await result.text(), /PRIVATE_PROVIDER_MESSAGE|synthetic-cloudflare/);
  });
  for (const value of ['cancelAtReservation', 'cancelAtSettlement', 'hungProvider']) await t.test(value + ' cannot resume after cancellation', async () => {
    reset(value); await assert.rejects(post()); await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(dispatches, value === 'cancelAtReservation' ? 0 : 1);
  });
  await t.test('silent and malformed PCM do not invoke a model', async () => {
    reset(); assert.equal((await post(wav(true))).status, 422); assert.notEqual((await post(Buffer.alloc(600))).status, 200); assert.equal(dispatches, 0);
  });
});
