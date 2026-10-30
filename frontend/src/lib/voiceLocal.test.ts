import test from 'node:test';
import assert from 'node:assert/strict';
import { recognizeVoiceSamples, transcribeVoiceLocally } from './voiceLocal';
import { VOICE_MAX_SECONDS, VOICE_SAMPLE_RATE, validateVoiceSamples, selectVoiceLanguage, voiceCompletionGuard, voiceSegments } from './voiceLocalProtocol';

test('long speech partitions cover all audio once, retain the tail and prefer quiet boundaries', () => {
  const samples = new Float32Array(VOICE_SAMPLE_RATE * 135).fill(0.1);
  samples.fill(0, VOICE_SAMPLE_RATE * 22, VOICE_SAMPLE_RATE * 23);
  const ranges = voiceSegments(samples);
  assert.ok(ranges[0][1] > VOICE_SAMPLE_RATE * 22 && ranges[0][1] < VOICE_SAMPLE_RATE * 23);
  assert.equal(ranges[0][0], 0); assert.equal(ranges.at(-1)![1], samples.length);
  for (let i = 0; i < ranges.length; i++) {
    assert.ok(ranges[i][1] > ranges[i][0] && ranges[i][1] - ranges[i][0] <= 25 * VOICE_SAMPLE_RATE);
    if (i) assert.equal(ranges[i][0], ranges[i-1][1]);
  }
});

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
  for (const data of [{ type: 'error' }, { type: 'complete', text: '' }, { type: 'complete', text: 'x'.repeat(100001) }, null]) {
    const f = fixture(), pending = f.run(); f.worker.onmessage!({ data }); await assert.rejects(pending); assert.equal(f.worker.stopped, 1);
  }
  const crash = fixture(), pending = crash.run(); crash.worker.onerror!(); await assert.rejects(pending);
  const timed = fixture(); await assert.rejects(timed.run(1), /timed out/); assert.equal(timed.worker.stopped, 1);
});
test('invalid, oversized, nonfinite and clipped samples never start a worker', () => {
  validateVoiceSamples(new Float32Array(VOICE_SAMPLE_RATE * 180));
  for (const samples of [null, new Float32Array(1), new Float32Array(VOICE_SAMPLE_RATE * VOICE_MAX_SECONDS + 1), new Float32Array(16000).fill(NaN), new Float32Array(16000).fill(2)]) {
    assert.throws(() => validateVoiceSamples(samples));
  }
});

test('browser codec overshoot is normalized before strict worker admission', async () => {
  const originals = ['OfflineAudioContext', 'Worker'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis,key)] as const);
  const decoded = new Float32Array(16000).fill(0.1);
  decoded[0] = 1.015005350112915; decoded[1] = -1.025;
  let posted: Float32Array | undefined;
  class Decoder {
    async decodeAudioData() { return { duration: 1, sampleRate: 16000, numberOfChannels: 1, length: decoded.length, getChannelData: () => decoded }; }
  }
  class LocalWorker {
    onmessage: ((event: {data: unknown}) => void) | null = null;
    onerror = null; onmessageerror = null;
    terminate() {}
    postMessage(samples: Float32Array) {
      posted = samples.slice();
      queueMicrotask(() => this.onmessage?.({data:{type:'complete',text:'Preserved speech.'}}));
    }
  }
  Object.defineProperty(globalThis,'OfflineAudioContext',{configurable:true,value:Decoder});
  Object.defineProperty(globalThis,'Worker',{configurable:true,value:LocalWorker});
  try {
    assert.equal(await transcribeVoiceLocally(new Blob([new Uint8Array(1024)]),new AbortController().signal,()=>{}),'Preserved speech.');
    assert.equal(posted?.[0],1); assert.equal(posted?.[1],-1);
    assert.ok(decoded.every(value => value === 0));
    decoded.fill(NaN);
    await assert.rejects(transcribeVoiceLocally(new Blob([new Uint8Array(1024)]),new AbortController().signal,()=>{}));
  } finally {
    for(const [key,descriptor] of originals) {
      if(descriptor) Object.defineProperty(globalThis,key,descriptor);
      else Reflect.deleteProperty(globalThis,key);
    }
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
