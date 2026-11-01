import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID} from 'node:crypto';
import voice from './voice.js';
import {createTenantContext} from '../security/tenantContext.js';

function wav(seconds = 1) {
  const data = Buffer.alloc(Math.round(seconds * 22050) * 2), header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(22050, 24); header.writeUInt32LE(44100, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

test('actual voice route requires original actor and budget, and cannot retry provider authorization denial', async t => {
  const owner = '11111111-1111-4111-8111-111111111111', context = createTenantContext({userId: owner, via: 'remote_getuser'});
  const names = ['NODE_ENV', 'OPENAI_API_KEY', 'OPENAI_TRANSCRIBE_MODEL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL'];
  const previous = names.map(name => process.env[name]);
  t.after(() => names.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; }));
  process.env.NODE_ENV = 'production'; process.env.OPENAI_API_KEY = 'synthetic-voice-platform-key'; delete process.env.OPENAI_TRANSCRIBE_MODEL;
  process.env.SUPABASE_URL = 'http://127.0.0.1:55439'; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  let actor = true, actorContext: unknown = context, mode = 'ok', effects = 0, cancellationInjected = 0;
  let responseNow: express.Response | undefined;
  const app = express(); app.use((req, res, next) => { responseNow = res; Object.assign(req, {userId: owner, tenantContext: actor ? actorContext : undefined}); next(); }); app.use('/voice', voice);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`, nativeFetch = globalThis.fetch;
  const reservations = new Map<string, Record<string, unknown>>();
  const releases: Record<string, unknown>[] = [], audits: Record<string, unknown>[] = [];
  const events: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input)); if (url.origin === base) return nativeFetch(input, init);
    if (url.origin === process.env.SUPABASE_URL) {
      const body = JSON.parse(String(init?.body));
      if (url.pathname === '/rest/v1/production_audit_log') {
        audits.push(body); events.push('audit:' + body.outcome);
        if (mode === 'auditFailure' || mode === 'completedAuditFailure' && body.outcome === 'COMPLETED') return Response.json({message: 'Synthetic audit failure'}, {status: 503});
        if (mode === 'wrongAuditReceipt') return Response.json({...body, user_id: randomUUID()});
        return Response.json(body);
      }
      if (url.pathname.endsWith('/reserve_xroga_provider_budget')) {
        assert.equal(body.p_user_id, owner); assert.ok(init?.signal);
        if (mode === 'reservationFailure') return Response.json({message: 'Synthetic denied reservation'}, {status: 400});
        const row = {id: randomUUID(), user_id: owner, status: 'reserved', internal_route: body.p_internal_route, idempotency_key: body.p_idempotency_key, price_version: body.p_price_version, purpose: body.p_purpose, estimated_input_tokens: body.p_estimated_input_tokens, maximum_output_tokens: body.p_maximum_output_tokens, reserved_micro_usd: body.p_reservation_micro_usd};
        reservations.set(row.id, row);
        if (mode === 'hungReservation') {cancellationInjected++; responseNow?.destroy(); return new Promise<Response>(() => {});}
        if (mode === 'badReservation') return Response.json({...row, user_id: randomUUID()});
        if (mode === 'rotateAtReservation') process.env.OPENAI_API_KEY = 'rotated-synthetic-voice-key';
        if (mode === 'cancelAtReservation') {cancellationInjected++; responseNow?.destroy(); await new Promise<void>(resolve => setImmediate(resolve));}
        return Response.json(row);
      }
      if (url.pathname.endsWith('/release_xroga_provider_budget')) {releases.push(body); return mode === 'releaseFailure' ? Response.json({message: 'Synthetic release failure'}, {status: 503}) : Response.json(null);}
      if (url.pathname.endsWith('/settle_xroga_provider_budget')) {
        events.push('settle'); const row = reservations.get(body.p_reservation_id); assert.ok(row);
        if (mode === 'settlementFailure') return Response.json({message: 'Synthetic settlement failure'}, {status: 503});
        if (mode === 'cancelAtSettlement') {cancellationInjected++; responseNow?.destroy(); await new Promise<void>(resolve => setImmediate(resolve));}
        if (mode === 'badSettlement') return Response.json({...row, status: 'settled', settled_micro_usd: 0});
        if (mode === 'foreignSettlement') return Response.json({...row, user_id: randomUUID(), status: 'settled'});
        return Response.json({...row, status: 'settled', settled_micro_usd: body.p_actual_micro_usd, provider_request_id: body.p_provider_request_id, actual_input_tokens: body.p_actual_input_tokens, cached_input_tokens: 0, output_tokens: body.p_output_tokens, reasoning_tokens: 0, tool_calls: 0, search_calls: 0});
      }
      if (url.pathname.endsWith('/record_ai_usage_atomic')) {
        events.push('usage');
        if (mode === 'hungUsage') {cancellationInjected++; responseNow?.destroy(); return new Promise<Response>(() => {});}
        if (mode === 'usageFailure') return Response.json({message: 'Synthetic usage failure'}, {status: 503});
        return Response.json({userId: owner, receiptId: body.p_receipt_id, modelId: body.p_model_id, poolRole: body.p_pool_role, inputTokens: body.p_input, outputTokens: body.p_output, costUsd: body.p_cost_usd, replayed: false, ledgerId: '1', period: '2026-10-01', usage: {user_id: owner}});
      }
      throw Error('Unexpected fixture database request');
    }
    assert.equal(url.href, 'https://api.openai.com/v1/audio/transcriptions'); effects++; events.push('provider');
    assert.equal(init?.redirect, 'manual'); assert.ok(init?.signal);
    const form = init?.body as FormData, model = form.get('model');
    assert.match(String(form.get('prompt')), /language they actually use/);
    assert.equal((form.get('file') as File).name, 'xroga-voice.wav');
    if (mode === 'authorization' && effects === 1) return Response.json({error: {message: 'SYNTHETIC_CREDENTIAL_PROVIDER_MESSAGE'}}, {status: 401});
    if (['403', '400', '307'].includes(mode)) return new Response('SYNTHETIC_CREDENTIAL_PROVIDER_MESSAGE', {status: Number(mode), headers: {location: 'https://untrusted.invalid'}});
    if (mode === 'outageFirst' && effects === 1 || mode === 'whisperRecovery' && model !== 'whisper-1' || mode === 'allOutage' || mode === 'releaseFailure') return Response.json({error: 'Synthetic availability failure'}, {status: 503});
    if (mode === 'rotateAfterDispatch') process.env.OPENAI_API_KEY = 'rotated-synthetic-voice-key';
    if (mode === 'hungProvider') {cancellationInjected++; responseNow?.destroy(); return new Promise<Response>(() => {});}
    if (mode === 'hungBody') {cancellationInjected++; responseNow?.destroy(); return new Response(new ReadableStream());}
    if (mode === 'oversized') return new Response('x'.repeat(65537));
    if (mode === 'malformed') return new Response('not-json');
    const output = mode === 'usageOverrun' ? 2001 : mode === 'fractionalUsage' ? 0.5 : 4;
    const usage = model === 'whisper-1' ? {type: 'duration', seconds: 1} : {type: 'tokens', input_tokens: 10, input_token_details: {text_tokens: 2, audio_tokens: 8}, output_tokens: output, total_tokens: mode === 'invalidUsage' ? 15 : 10 + output};
    return Response.json({text: mode === 'secretTranscript' ? 'synthetic-voice-platform-key' : mode === 'emptyText' ? '' : 'Ordinary fixture transcript', language: mode === 'secretLanguage' ? 'synthetic-voice-platform-key' : 'auto', ...(mode === 'missingUsage' ? {} : {usage})}, {headers: mode === 'missingRequestId' ? {} : {'x-request-id': 'synthetic-voice-receipt'}});
  });
  const post = (body = wav()) => nativeFetch(base + '/voice/transcribe', {method: 'POST', headers: {'content-type': 'audio/wav'}, body});
  await t.test('raw user identity and missing durable reservation send no audio', async () => {
    actor = false; effects = 0; const result = await post(); assert.notEqual(result.status, 200); assert.equal(effects, 0);
    actor = true; effects = 0; const unavailable = await post(); assert.notEqual(unavailable.status, 200); assert.equal(effects, 0);
  });
  await t.test('provider 401 is terminal instead of a model fallback trigger', async () => {
    actor = true; process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-only'; mode = 'authorization'; effects = 0;
    const result = await post(); assert.notEqual(result.status, 200); assert.equal(effects, 1);
    assert.doesNotMatch(await result.text(), /SYNTHETIC_CREDENTIAL_PROVIDER_MESSAGE/);
  });
  for (const failure of ['403', '400', '307', 'rotateAfterDispatch', 'missingUsage', 'invalidUsage', 'usageOverrun', 'fractionalUsage', 'missingRequestId', 'secretTranscript', 'emptyText', 'settlementFailure', 'badSettlement', 'foreignSettlement', 'usageFailure', 'completedAuditFailure', 'oversized', 'malformed', 'releaseFailure']) await t.test(`${failure} cannot publish or trigger model fallback`, async () => {
    process.env.OPENAI_API_KEY = 'synthetic-voice-platform-key'; mode = failure; effects = 0;
    const result = await post(); assert.notEqual(result.status, 200); assert.equal(effects, 1);
    assert.doesNotMatch(await result.text(), /SYNTHETIC_CREDENTIAL|synthetic-voice-platform-key|Ordinary fixture transcript/);
  });
  await t.test('original authorized request settles both canonical ledgers before response', async () => {
    process.env.OPENAI_API_KEY = 'synthetic-voice-platform-key'; mode = 'ok'; effects = 0; events.length = 0;
    const result = await post(); assert.equal(result.status, 200); assert.equal(effects, 1);
    assert.equal((await result.json() as {text: string}).text, 'Ordinary fixture transcript');
    assert.deepEqual(events, ['audit:ADMITTED', 'provider', 'settle', 'usage', 'audit:COMPLETED']);
    assert.doesNotMatch(JSON.stringify(audits), /synthetic-voice-platform-key|Ordinary fixture transcript|SYNTHETIC_CREDENTIAL/);
  });
  for (const recovery of ['outageFirst', 'whisperRecovery']) await t.test(`${recovery} uses a fresh reservation for each existing model`, async () => {
    mode = recovery; effects = 0; const before = reservations.size;
    const result = await post(); assert.equal(result.status, 200); assert.equal(effects, recovery === 'outageFirst' ? 2 : 3);
    assert.equal(reservations.size, before + effects);
    assert.equal(releases.at(-1)?.p_pending_reconciliation, true);
    if (recovery === 'whisperRecovery') assert.equal((await result.json() as {model: string}).model, 'whisper-1');
  });
  await t.test('audit denial and forged PCM duration or hidden metadata prevent all dispatch', async () => {
    mode = 'auditFailure'; effects = 0; assert.notEqual((await post()).status, 200); assert.equal(effects, 0);
    mode = 'ok';
    for (const input of [Buffer.alloc(1024), wav(126), Buffer.concat([wav(), Buffer.from('unapproved trailer')])]) {
      assert.notEqual((await post(input)).status, 200); assert.equal(effects, 0);
    }
    const secret = wav(); secret.write('synthetic-voice-platform-key', 1000);
    assert.notEqual((await post(secret)).status, 200); assert.equal(effects, 0);
  });
  await t.test('cloned and foreign issued actor, failed reservation and rotated credential have no dispatch', async () => {
    mode = 'ok'; effects = 0;
    for (actorContext of [{...context}, createTenantContext({userId: randomUUID(), via: 'remote_getuser'})]) {
      assert.notEqual((await post()).status, 200); assert.equal(effects, 0);
    }
    actorContext = context;
    for (mode of ['reservationFailure', 'badReservation', 'rotateAtReservation']) {
      process.env.OPENAI_API_KEY = 'synthetic-voice-platform-key';
      assert.notEqual((await post()).status, 200); assert.equal(effects, 0);
    }
    process.env.OPENAI_API_KEY = 'synthetic-voice-platform-key';
  });
  for (const at of ['cancelAtReservation', 'cancelAtSettlement']) await t.test(`${at} stops publication and all later model attempts`, async () => {
    mode = at; effects = 0; cancellationInjected = 0;
    await assert.rejects(post()); await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(cancellationInjected, 1); assert.equal(effects, at === 'cancelAtReservation' ? 0 : 1);
  });
  for (const at of ['hungReservation', 'hungProvider', 'hungBody', 'hungUsage']) await t.test(`${at} cannot keep a cancelled request active or authorize fallback`, async () => {
    mode = at; effects = 0; cancellationInjected = 0;
    await assert.rejects(post()); await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(cancellationInjected, 1); assert.equal(effects, at === 'hungReservation' ? 0 : 1);
  });
  await t.test('provider language metadata cannot expose held credentials', async () => {
    mode = 'secretLanguage'; effects = 0; const result = await post(); assert.equal(result.status, 200);
    assert.doesNotMatch(await result.text(), /synthetic-voice-platform-key/); assert.equal(effects, 1);
  });
  await t.test('only exhausted ordinary availability attempts return the explicit recoverable result', async () => {
    mode = 'allOutage'; effects = 0; const result = await post(); assert.equal(result.status, 503);
    assert.equal(effects, 3); assert.equal((await result.json() as {code: string}).code, 'VOICE_PROVIDER_UNAVAILABLE');
    mode = 'wrongAuditReceipt'; effects = 0; assert.notEqual((await post()).status, 200); assert.equal(effects, 0);
  });
});
