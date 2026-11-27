import assert from 'node:assert/strict';
import test from 'node:test';
import {createDictationPipeline, TRANSIENT_RETRY_DELAYS_MS} from './voiceDictation';
import type {VoiceSegment} from './voiceSegmenter';

const RATE = 16000;
const segment = (seq: number): VoiceSegment => {
  const samples = new Float32Array(2 * RATE);
  for (let i = 0; i < samples.length; i++) samples[i] = 0.2 * Math.sin(i / 7);
  return {seq, samples, rate: RATE, startSeconds: seq * 2, endSeconds: (seq + 1) * 2};
};
class Failure extends Error { constructor(public status: number, public data: {code?: string} = {}) { super('failed'); } }
function run(replies: Array<string | Error>) {
  let calls = 0;
  const delays: number[] = [];
  const pipeline = createDictationPipeline({signal: new AbortController().signal, wait: async ms => { delays.push(ms); },
    transcribe: async () => { const reply = replies[Math.min(calls++, replies.length - 1)]; if (reply instanceof Error) throw reply; return reply; }});
  return {pipeline, calls: () => calls, delays};
}

test('a segment the server hears no speech in is quiet, not a failed recording', async () => {
  const job = run(['kept words', new Failure(422, {code: 'VOICE_NO_SPEECH'})]);
  job.pipeline.add(segment(0)); job.pipeline.add(segment(1));
  await job.pipeline.settle();
  const result = job.pipeline.result();
  assert.deepEqual({text: result.text, complete: result.complete, calls: job.calls()}, {text: 'kept words', complete: true, calls: 2});
});

test('passing network, busy and provider failures are retried automatically', async () => {
  for (const error of [new TypeError('Failed to fetch'), new Failure(429, {code: 'VOICE_BUSY'}), new Failure(503, {code: 'VOICE_PROVIDER_UNAVAILABLE'}), new Failure(502), new Failure(504)]) {
    const job = run([error, 'recovered']);
    job.pipeline.add(segment(0));
    await job.pipeline.settle();
    assert.equal(job.pipeline.result().text, 'recovered');
    assert.equal(job.calls(), 2);
    assert.deepEqual(job.delays, [TRANSIENT_RETRY_DELAYS_MS[0]]);
  }
});

test('automatic retry is bounded and then keeps the audio for a manual retry', async () => {
  const job = run([new TypeError('offline')]);
  job.pipeline.add(segment(0));
  await job.pipeline.settle();
  assert.equal(job.calls(), 1 + TRANSIENT_RETRY_DELAYS_MS.length);
  assert.equal(job.pipeline.result().complete, false);
});

test('security, sign-in, quota, cancelled and unverified failures are never retried automatically', async () => {
  for (const error of [new Failure(503, {code: 'VOICE_TRANSCRIPTION_DENIED'}), new Failure(401), new Failure(429, {code: 'VOICE_QUOTA_EXHAUSTED'}),
    new Failure(409, {code: 'VOICE_SESSION_CHANGED'}), new Failure(422, {code: 'VOICE_TRANSCRIPTION_DENIED'}), Object.assign(new Error('cancelled'), {name: 'AbortError'})]) {
    const job = run([error, 'must not be requested']);
    job.pipeline.add(segment(0));
    await job.pipeline.settle();
    assert.equal(job.calls(), 1);
    assert.equal(job.pipeline.result().complete, false);
  }
});

test('cancelling while waiting to retry sends nothing more', async () => {
  const cancellation = new AbortController();
  let calls = 0;
  const pipeline = createDictationPipeline({signal: cancellation.signal, wait: async () => { cancellation.abort(); },
    transcribe: async () => { calls++; throw new TypeError('offline'); }});
  pipeline.add(segment(0));
  await pipeline.settle();
  assert.equal(calls, 1);
});
