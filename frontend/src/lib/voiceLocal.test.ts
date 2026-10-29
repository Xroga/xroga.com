import test from 'node:test';
import assert from 'node:assert/strict';
import { recognizeVoiceSamples } from './voiceLocal';
import { validateVoiceSamples, selectVoiceLanguage, voiceCompletionGuard } from './voiceLocalProtocol';

function fixture() {
  const worker = { onmessage: null as ((event: {data: unknown}) => void) | null, onerror: null as (() => void) | null, onmessageerror: null as (() => void) | null,
    stopped: 0, posted: 0, terminate() { this.stopped++; }, postMessage() { this.posted++; } };
  const abort = new AbortController(), samples = new Float32Array(16000).fill(0.1);
  const progress: string[] = [];
  return { worker, abort, samples, progress,
    run: (timeout = 1000) => recognizeVoiceSamples(samples, abort.signal, stage => progress.push(stage), () => worker as unknown as Worker, timeout) };
}
test('on-device recognition preserves multilingual repeated text, publishes once and releases resources', async () => {
  const f = fixture(), pending = f.run();
  f.worker.onmessage!({ data: { type: 'progress', stage: 'loading' } });
  f.worker.onmessage!({ data: { type: 'complete', text: 'send send اردو हिन्दी العربية' } });
  f.worker.onmessage!({ data: { type: 'complete', text: 'duplicate' } });
  assert.equal(await pending, 'send send اردو हिन्दी العربية');
  assert.equal(f.worker.stopped, 1); assert.equal(f.worker.posted, 1);
  assert.deepEqual(f.progress, ['loading']); assert.ok(f.samples.every(x => x === 0));
});
test('cancel during loading/inference terminates the worker and denies late transcripts', async () => {
  const f = fixture(), pending = f.run();
  f.abort.abort(); f.worker.onmessage!({ data: { type: 'complete', text: 'late' } });
  await assert.rejects(pending, { name: 'AbortError' }); assert.equal(f.worker.stopped, 1);
  const g = fixture(); g.abort.abort(); await assert.rejects(g.run(), { name: 'AbortError' }); assert.equal(g.worker.posted, 0);
});
test('download errors, malformed results, worker crashes and timeout preserve the draft', async () => {
  for (const data of [{ type: 'error' }, { type: 'complete', text: '' }, { type: 'complete', text: 'x'.repeat(20001) }, null]) {
    const f = fixture(), pending = f.run(); f.worker.onmessage!({ data }); await assert.rejects(pending); assert.equal(f.worker.stopped, 1);
  }
  const crash = fixture(), pending = crash.run(); crash.worker.onerror!(); await assert.rejects(pending);
  const timed = fixture(); await assert.rejects(timed.run(1), /timed out/); assert.equal(timed.worker.stopped, 1);
});
test('invalid, oversized, nonfinite and clipped samples never start a worker', () => {
  for (const samples of [null, new Float32Array(1), new Float32Array(2000001), new Float32Array(16000).fill(NaN), new Float32Array(16000).fill(2)]) {
    assert.throws(() => validateVoiceSamples(samples));
  }
});
test('language detection selects only model language tokens and never silently defaults to English', () => {
  assert.equal(selectVoiceLanguage([100, 1, 4, 3], { '<|en|>': 1, '<|ur|>': 2, '<|ar|>': 3 }), 'ur');
  assert.equal(selectVoiceLanguage([0, 4, 3], { '<|hi|>': 1, '<|en|>': 2 }), 'hi');
  assert.throws(() => selectVoiceLanguage([1], {}));
  assert.throws(() => selectVoiceLanguage([1], { '<|en|>': 99 }));
  assert.throws(() => selectVoiceLanguage([NaN], { '<|en|>': 0 }));
});
test('decoder token exhaustion cannot be published as a complete transcript', () => {
  const guard = voiceCompletionGuard(50257);
  guard.put([[10n, 10n, 50257n]]); guard.end();
  guard.put([[10n, 10n]]); assert.throws(() => guard.end(), /before completion/);
  assert.throws(() => voiceCompletionGuard([]));
});
