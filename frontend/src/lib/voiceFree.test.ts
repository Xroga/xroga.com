import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as protocol from './voiceLocalProtocol';
import {encodeVoicePcm} from './voicePcm';
import {voiceClientAwait} from './voiceRequestPolicy';

function fixture(mode = 'ok') {
  const samples = new Float32Array(50 * 16000).fill(mode === 'silence' ? 0 : 0.1);
  const calls: Array<{bytes: number; options: unknown}> = []; let decoded = 0;
  class ApiError extends Error {}
  const context = {exports: {}, Blob, Uint8Array, Error,
    require: (name: string) => {
      if (name === '@/lib/api') return {ApiError, getAccessToken: async () => mode === 'guest' ? null : 'original-token'};
      if (name === './voiceRequestPolicy') return {voiceClientAwait};
      if (name === './voiceLocalProtocol') return protocol;
      if (name === './voicePcm') return {encodeVoicePcm};
      if (name === './voiceLocal') return {transcribeVoiceLocally: async (_audio: Blob, signal: AbortSignal, progress: unknown, recognize: (samples: Float32Array, signal: AbortSignal, progress: unknown) => Promise<string>) => {
        decoded++; return recognize(samples, signal, progress);
      }};
      if (name === './voiceApi') return {transcribeVoiceAudio: async (audio: Blob, signal: AbortSignal, options: unknown) => {
        signal.throwIfAborted(); calls.push({bytes: audio.size, options});
        if (mode === 'secondDenied' && calls.length === 2) throw new Error('Denied');
        if (mode === 'cancelFirst') throw new DOMException('Cancelled', 'AbortError');
        return calls.length === 1 ? 'send send اردو' : 'हिंदी English';
      }};
      throw new Error('Unexpected free voice import ' + name);
    }};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./voiceFree.ts', import.meta.url), 'utf8'), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS},
  }).outputText, context);
  const run = (signal = new AbortController().signal) => (context.exports as {transcribeFreeVoiceAudio: (audio: Blob, signal: AbortSignal, progress: () => void) => Promise<string>})
    .transcribeFreeVoiceAudio(new Blob(['synthetic-audio']), signal, () => {});
  return {run, samples, calls, decoded: () => decoded};
}

test('free dictation preserves contiguous speech and repeated words through bounded first-party PCM calls', async () => {
  const f = fixture(); assert.equal(await f.run(), 'send send اردو हिंदी English'); assert.equal(f.calls.length, 2);
  for (const call of f.calls) {
    assert.ok(call.bytes <= 44 + 25 * 22050 * 2);
    assert.deepEqual(JSON.parse(JSON.stringify(call.options)), {freeOnly: true, preparedPcm: true, expectedToken: 'original-token'});
  }
  assert.equal(f.samples.some(value => value !== 0), false);
});

test('failed or cancelled chunks never publish a partial transcript or retry another provider', async () => {
  for (const mode of ['secondDenied', 'cancelFirst']) {
    const f = fixture(mode); await assert.rejects(f.run()); assert.equal(f.calls.length, mode === 'secondDenied' ? 2 : 1);
    assert.equal(f.samples.some(value => value !== 0), false);
  }
});

test('guest, pre-cancelled and silent requests do not dispatch audio', async () => {
  const guest = fixture('guest'); await assert.rejects(guest.run()); assert.equal(guest.decoded(), 0); assert.equal(guest.calls.length, 0);
  const cancelled = fixture(), abort = new AbortController(); abort.abort(); await assert.rejects(cancelled.run(abort.signal)); assert.equal(cancelled.calls.length, 0);
  const silence = fixture('silence'); await assert.rejects(silence.run(), {name: 'VoiceSilenceError'}); assert.equal(silence.calls.length, 0);
});
