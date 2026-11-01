import assert from 'node:assert/strict';
import test from 'node:test';
import {createDictationPipeline, MAX_CONCURRENT_UPLOADS, MAX_RETAINED_SEGMENTS} from './voiceDictation';
import type {VoiceSegment} from './voiceSegmenter';

const RATE = 16000;
const segment = (seq: number, loud = true, seconds = 2): VoiceSegment => {
  const samples = new Float32Array(seconds * RATE);
  if (loud) for (let i = 0; i < samples.length; i++) samples[i] = 0.2 * Math.sin(i / 7);
  return {seq, samples, rate: RATE, startSeconds: seq * seconds, endSeconds: (seq + 1) * seconds};
};
class Failure extends Error { constructor(message: string, public status: number, public data: unknown = {}) { super(message); } }
const wavLength = async (wav: Blob) => (await wav.arrayBuffer()).byteLength;

test('segments are merged in recording order even when replies arrive out of order', async () => {
  const replies = new Map<number, (text: string) => void>();
  let call = 0;
  const pipeline = createDictationPipeline({
    signal: new AbortController().signal,
    transcribe: () => new Promise<string>(resolve => { replies.set(call++, resolve); }),
  });
  pipeline.add(segment(0)); pipeline.add(segment(1));
  replies.get(1)!('second'); replies.get(0)!('first');
  await pipeline.settle();
  const result = pipeline.result();
  assert.equal(result.text, 'first second');
  assert.equal(result.complete, true);
});

test('repeated spoken text is preserved, never deduplicated', async () => {
  const pipeline = createDictationPipeline({signal: new AbortController().signal, transcribe: async () => 'call me'});
  pipeline.add(segment(0)); pipeline.add(segment(1));
  await pipeline.settle();
  assert.equal(pipeline.result().text, 'call me call me');
});

test('silent segments cost no request and an all-silent recording has no speech segments', async () => {
  let requests = 0;
  const pipeline = createDictationPipeline({signal: new AbortController().signal, transcribe: async () => { requests++; return 'x'; }});
  pipeline.add(segment(0, false)); pipeline.add(segment(1, true, 0.1));
  await pipeline.settle();
  assert.equal(requests, 0);
  assert.equal(pipeline.result().hadSpeechSegments, false);
  assert.equal(pipeline.result().text, '');
});

test('uploads are bounded to the concurrency limit', async () => {
  let running = 0, peak = 0;
  const release: Array<() => void> = [];
  const pipeline = createDictationPipeline({
    signal: new AbortController().signal,
    transcribe: () => new Promise<string>(resolve => {
      running++; peak = Math.max(peak, running);
      release.push(() => { running--; resolve('ok'); });
    }),
  });
  for (let i = 0; i < 5; i++) pipeline.add(segment(i));
  assert.equal(running, MAX_CONCURRENT_UPLOADS);
  while (release.length) { release.shift()!(); await new Promise(resolve => setImmediate(resolve)); }
  await pipeline.settle();
  assert.equal(peak, MAX_CONCURRENT_UPLOADS);
  assert.equal(pipeline.result().complete, true);
});

test('a failed segment is retained, the transcript is not complete, and retry sends only that segment', async () => {
  const sent: number[] = [];
  let failMiddle = true;
  const pipeline = createDictationPipeline({
    signal: new AbortController().signal,
    transcribe: async wav => {
      const size = await wavLength(wav);
      sent.push(size);
      // Segment 1 is longer than the others, so its upload is identifiable by size.
      if (size > 100000) {
        if (failMiddle) { failMiddle = false; throw new Failure('busy', 503, {code: 'VOICE_PROVIDER_UNAVAILABLE'}); }
        return 'middle';
      }
      return 'edge';
    },
  });
  pipeline.add(segment(0)); pipeline.add(segment(1, true, 5)); pipeline.add(segment(2));
  await pipeline.settle();
  let result = pipeline.result();
  assert.equal(result.complete, false);
  assert.equal(result.unfinished, 1);
  assert.equal(result.text, 'edge edge', 'completed segments are kept, the failed one is not skipped silently');
  const before = sent.length;
  await pipeline.retry();
  result = pipeline.result();
  assert.equal(sent.length, before + 1, 'only the failed segment is sent again');
  assert.equal(result.complete, true);
  assert.equal(result.text, 'edge middle edge');
});

test('quota exhaustion stops further uploads and keeps every unsent segment', async () => {
  let requests = 0;
  const pipeline = createDictationPipeline({
    signal: new AbortController().signal,
    transcribe: async () => { requests++; throw new Failure('Allowance used', 429, {code: 'VOICE_QUOTA_EXHAUSTED'}); },
  });
  for (let i = 0; i < 6; i++) pipeline.add(segment(i));
  await pipeline.settle();
  assert.ok(requests <= MAX_CONCURRENT_UPLOADS, `sent ${requests} requests after the quota error`);
  const result = pipeline.result();
  assert.equal(result.complete, false);
  assert.equal(result.unfinished, 6);
  assert.equal((result.error as Failure).status, 429);
});

test('a switched account blocks uploads and cannot publish', async () => {
  const pipeline = createDictationPipeline({
    signal: new AbortController().signal,
    transcribe: async () => { throw new Failure('changed', 401, {code: 'VOICE_SESSION_CHANGED'}); },
  });
  pipeline.add(segment(0)); pipeline.add(segment(1));
  await pipeline.settle();
  const result = pipeline.result();
  assert.equal(result.complete, false);
  assert.equal(result.text, '');
});

test('cancelling sends nothing further and a late reply cannot add text after dispose', async () => {
  const abort = new AbortController();
  let finish!: (text: string) => void;
  const pipeline = createDictationPipeline({signal: abort.signal, transcribe: () => new Promise<string>(resolve => { finish = resolve; })});
  pipeline.add(segment(0));
  abort.abort(); pipeline.dispose();
  finish('late text for another chat');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pipeline.result().text, '');
  pipeline.add(segment(1));
  assert.equal(pipeline.result().complete, true, 'nothing queued after cancel');
});

test('audio piling up behind a slow connection is reported as overload before memory grows unbounded', () => {
  const pipeline = createDictationPipeline({signal: new AbortController().signal, transcribe: () => new Promise<string>(() => {})});
  for (let i = 0; i <= MAX_RETAINED_SEGMENTS; i++) pipeline.add(segment(i));
  assert.equal(pipeline.overloaded, true);
});
