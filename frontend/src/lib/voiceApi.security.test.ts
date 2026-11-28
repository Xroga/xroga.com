import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {sameVoiceAccount, voiceClientAwait, voiceDeadline, isTerminalVoiceFailure} from './voiceRequestPolicy';
import {isVoiceLanguage} from './voiceLanguage';

/** AbortSignal as shipped by Safari before iOS 17.4: no static any(). */
const olderIosAbortSignal = {timeout: (ms: number) => AbortSignal.timeout(ms)};

function actualVoiceApi(mode: string, freeOnly = false, abortSignal: unknown = AbortSignal, reply?: () => Response, language?: string) {
  let token: string | null = 'original-user-token', target = '', requests = 0, wire: AbortSignal | undefined, accept: string | null = null;
  class ApiError extends Error {constructor(message: string, public status: number, public data: unknown = {}) {super(message);}}
  const context: Record<string, unknown> = {exports: {}, encodeURIComponent, AbortSignal: abortSignal, AbortController, setTimeout, clearTimeout, Blob, Response, TextDecoder, Uint8Array, Error,
    require: (name: string) => {
      if (name === './voiceLanguage') return {isVoiceLanguage};
      if (name === './voiceRequestPolicy') return {sameVoiceAccount, voiceClientAwait, voiceDeadline};
      if (name === './voicePcm') return {normalizeVoiceAudio: async () => {
        if (mode === 'changeDuringNormalize') token = 'different-account-token';
        if (mode === 'logoutDuringNormalize') token = null;
        return new Blob([new Uint8Array(1024)], {type: 'audio/wav'});
      }};
      if (name === '@/lib/api') return {API_URL: 'https://api.xroga.com', ApiError, getAccessToken: async () => token,
        fetchApiResponse: async (url: string, init: RequestInit) => {
          requests++; target = url; if (language === undefined) assert.equal(url, 'https://api.xroga.com/api/voice/' + (freeOnly ? 'transcribe-free' : 'transcribe'));
          assert.equal(new Headers(init.headers).get('authorization'), 'Bearer original-user-token');
          assert.equal(new Headers(init.headers).get('content-type'), 'audio/wav'); assert.ok(init.signal);
          wire = init.signal ?? undefined; accept = new Headers(init.headers).get('accept');
          if (reply) return reply();
          if (mode === 'changeAfterResponse') token = 'different-account-token';
          if (mode === 'oversized') return new Response('x'.repeat(128001));
          if (mode === 'denial') return Response.json({error: 'Static denied response', code: 'VOICE_TRANSCRIPTION_DENIED'}, {status: 503});
          if (mode === 'outage') return Response.json({error: 'Static provider unavailable', code: 'VOICE_PROVIDER_UNAVAILABLE'}, {status: 503});
          return Response.json({text: 'Verified owned transcript'});
        }};
      throw Error('Unexpected voice API dependency ' + name);
    }};
  const source = readFileSync(new URL('./voiceApi.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText, context, {timeout: 1000});
  return {target: () => target, requests: () => requests, wire: () => wire, accept: () => accept, run: (signal?: AbortSignal) => (context.exports as {transcribeVoiceAudio: (audio: Blob, signal?: AbortSignal, options?: {freeOnly: true; preparedPcm: true; expectedToken: string}) => Promise<string>}).transcribeVoiceAudio(new Blob([new Uint8Array(1024)]), signal,
    freeOnly ? {freeOnly: true, preparedPcm: true, expectedToken: 'original-user-token', ...(language === undefined ? {} : {language})} : undefined)};
}

test('actual voice API pins the original session through local decoding and publication', async t => {
  for (const mode of ['changeDuringNormalize', 'logoutDuringNormalize', 'changeAfterResponse']) await t.test(mode, async () => {
    const api = actualVoiceApi(mode);
    await assert.rejects(api.run(), error => {assert.equal((error as {data?: {code?: string}}).data?.code, 'VOICE_SESSION_CHANGED'); return true;});
    assert.equal(api.requests(), mode === 'changeAfterResponse' ? 1 : 0);
  });
  await t.test('cancelled capture sends nothing', async () => {
    const api = actualVoiceApi('ok'), cancellation = new AbortController(); cancellation.abort();
    await assert.rejects(api.run(cancellation.signal)); assert.equal(api.requests(), 0);
  });
  await t.test('denial and oversize are terminal, ordinary availability stays recoverable', async () => {
    for (const mode of ['denial', 'oversized', 'outage']) {
      const api = actualVoiceApi(mode);
      await assert.rejects(api.run(), error => {assert.equal(isTerminalVoiceFailure(error), mode !== 'outage'); return true;});
      assert.equal(api.requests(), 1);
    }
  });
  await t.test('authorized current user receives the verified transcript once', async () => {
    const api = actualVoiceApi('ok'); assert.equal(await api.run(), 'Verified owned transcript'); assert.equal(api.requests(), 1);
  });
});

test('prepared PCM uses only the free endpoint and pins the original session', async () => {
  const positive = actualVoiceApi('ok', true);
  assert.equal(await positive.run(), 'Verified owned transcript'); assert.equal(positive.requests(), 1);
  const changed = actualVoiceApi('changeAfterResponse', true);
  await assert.rejects(changed.run(), error => (error as {data?: {code?: string}}).data?.code === 'VOICE_SESSION_CHANGED');
  assert.equal(changed.requests(), 1);
  const denied = actualVoiceApi('denial', true);
  await assert.rejects(denied.run()); assert.equal(denied.requests(), 1);
});

test('an iPhone without AbortSignal.any still uploads the recording and receives the transcript', async () => {
  const api = actualVoiceApi('ok', true, olderIosAbortSignal);
  assert.equal(await api.run(), 'Verified owned transcript');
  assert.equal(api.requests(), 1);
  const cancellation = new AbortController(); cancellation.abort();
  const cancelled = actualVoiceApi('ok', true, olderIosAbortSignal);
  await assert.rejects(cancelled.run(cancellation.signal));
  assert.equal(cancelled.requests(), 0);
});

test('the voice deadline aborts on cancellation and on timeout, without AbortSignal.any', async () => {
  const cancellation = new AbortController();
  const cancelled = voiceDeadline(60000, cancellation.signal);
  assert.equal(cancelled.aborted, false);
  cancellation.abort();
  assert.equal(cancelled.aborted, true);
  assert.equal(voiceDeadline(60000, cancellation.signal).aborted, true);
  const expired = voiceDeadline(5);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(expired.aborted, true);
});

test('the free upload takes the transcript from the first line and leaves the connection to finish', async t => {
  const line = new TextEncoder().encode(JSON.stringify({text: 'Early transcript'}) + String.fromCharCode(10));
  await t.test('resolves while the server is still writing, and a later release does not cut the request', async () => {
    let cancelled = false, finish!: () => void;
    const api = actualVoiceApi('ok', true, AbortSignal, () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {controller.enqueue(line.slice(0, 7)); controller.enqueue(line.slice(7)); finish = () => controller.close();},
      cancel() {cancelled = true;},
    }), {headers: {'content-type': 'application/x-ndjson; charset=utf-8'}}));
    const release = new AbortController();
    assert.equal(await api.run(release.signal), 'Early transcript');
    release.abort();
    assert.equal(api.wire()?.aborted, false); assert.equal(cancelled, false);
    assert.equal(api.accept(), 'application/x-ndjson');
    finish();
  });
  await t.test('cancelling before the text arrives still aborts the upload', async () => {
    const api = actualVoiceApi('ok', true, AbortSignal, () => new Response(new ReadableStream<Uint8Array>({start() {}}), {headers: {'content-type': 'application/x-ndjson'}}));
    const cancellation = new AbortController(), pending = api.run(cancellation.signal);
    await new Promise(resolve => setTimeout(resolve, 10)); cancellation.abort();
    await assert.rejects(pending); assert.equal(api.wire()?.aborted, true);
  });
  await t.test('a stream that ends before the line is complete publishes nothing', async () => {
    const api = actualVoiceApi('ok', true, AbortSignal, () => new Response(line.slice(0, line.length - 1), {headers: {'content-type': 'application/x-ndjson'}}));
    await assert.rejects(api.run());
  });
  await t.test('the paid route keeps asking for a whole JSON reply', async () => {
    const api = actualVoiceApi('ok'); await api.run(); assert.equal(api.accept(), null);
  });
});

test('a chosen speech language travels only as a listed code on the free upload', async () => {
  const chosen = actualVoiceApi('ok', true, AbortSignal, undefined, 'hi');
  await chosen.run(); assert.equal(chosen.target(), 'https://api.xroga.com/api/voice/transcribe-free?language=hi');
  for (const value of ['', 'xx', 'hi&admin=1']) {
    const other = actualVoiceApi('ok', true, AbortSignal, undefined, value);
    await other.run(); assert.equal(other.target(), 'https://api.xroga.com/api/voice/transcribe-free', value);
  }
});
