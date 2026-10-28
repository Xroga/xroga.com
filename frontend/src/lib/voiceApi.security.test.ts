import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {voiceClientAwait, isTerminalVoiceFailure} from './voiceRequestPolicy';

function actualVoiceApi(mode: string) {
  let token: string | null = 'original-user-token', requests = 0;
  class ApiError extends Error {constructor(message: string, public status: number, public data: unknown = {}) {super(message);}}
  const context: Record<string, unknown> = {exports: {}, AbortSignal, Blob, Response, TextDecoder, Uint8Array, Error,
    require: (name: string) => {
      if (name === './voiceRequestPolicy') return {voiceClientAwait};
      if (name === './voicePcm') return {normalizeVoiceAudio: async () => {
        if (mode === 'changeDuringNormalize') token = 'different-account-token';
        if (mode === 'logoutDuringNormalize') token = null;
        return new Blob([new Uint8Array(1024)], {type: 'audio/wav'});
      }};
      if (name === '@/lib/api') return {API_URL: 'https://api.xroga.com', ApiError, getAccessToken: async () => token,
        fetchApiResponse: async (url: string, init: RequestInit) => {
          requests++; assert.equal(url, 'https://api.xroga.com/api/voice/transcribe');
          assert.equal(new Headers(init.headers).get('authorization'), 'Bearer original-user-token');
          assert.equal(new Headers(init.headers).get('content-type'), 'audio/wav'); assert.ok(init.signal);
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
  return {requests: () => requests, run: (signal?: AbortSignal) => (context.exports as {transcribeVoiceAudio: (audio: Blob, signal?: AbortSignal) => Promise<string>}).transcribeVoiceAudio(new Blob([new Uint8Array(1024)]), signal)};
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
