import assert from 'node:assert/strict';
import test from 'node:test';
import {createVoiceSegmenter, quietCutIndex, SEGMENT_TARGET_SECONDS, type VoiceSegment} from './voiceSegmenter';

const RATE = 16000;
/** Loud tone with a short digital-silence gap at `gapAt` seconds. */
function speech(seconds: number, gapAt?: number) {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < out.length; i++) out[i] = 0.3 * Math.sin(i / 10);
  if (gapAt !== undefined) out.fill(0, Math.round(gapAt * RATE), Math.round((gapAt + 0.2) * RATE));
  return out;
}
const feed = (segmenter: ReturnType<typeof createVoiceSegmenter>, audio: Float32Array, step = 2048) => {
  for (let at = 0; at < audio.length; at += step) segmenter.push(audio.slice(at, at + step));
};

test('cuts a long recording in the pause, loses and duplicates no samples', () => {
  const out: VoiceSegment[] = [];
  const segmenter = createVoiceSegmenter(RATE, segment => out.push(segment));
  const audio = speech(40, 22);
  const total = audio.length;
  feed(segmenter, audio);
  segmenter.flush();
  assert.equal(out.length, 2);
  assert.equal(out.reduce((sum, segment) => sum + segment.samples.length, 0), total);
  const boundary = out[0].samples.length / RATE;
  assert.ok(boundary > 22 && boundary < 22.2, `cut at ${boundary}s, expected inside the 22.0-22.2s pause`);
  assert.deepEqual(out.map(segment => segment.seq), [0, 1]);
  assert.equal(out[1].startSeconds, out[0].endSeconds);
});

test('a recording shorter than the window is one segment emitted on flush', () => {
  const out: VoiceSegment[] = [];
  const segmenter = createVoiceSegmenter(RATE, segment => out.push(segment));
  feed(segmenter, speech(10));
  assert.equal(out.length, 0);
  segmenter.flush();
  assert.equal(out.length, 1);
  assert.equal(out[0].samples.length, 10 * RATE);
  segmenter.flush();
  assert.equal(out.length, 1, 'flush is idempotent');
});

test('continuous speech with no pause still cuts inside the search window', () => {
  const samples = speech(SEGMENT_TARGET_SECONDS + 0.1);
  const cut = quietCutIndex(samples, RATE);
  assert.ok(cut >= 18 * RATE && cut <= samples.length);
});

test('segment audio is reproduced exactly, so repeated speech is never removed', () => {
  const out: VoiceSegment[] = [];
  const segmenter = createVoiceSegmenter(RATE, segment => out.push(segment));
  const phrase = speech(3);
  const audio = new Float32Array(phrase.length * 2);
  audio.set(phrase, 0); audio.set(phrase, phrase.length);
  const copy = audio.slice();
  feed(segmenter, audio, 1000);
  segmenter.flush();
  const joined = new Float32Array(copy.length);
  let at = 0;
  for (const segment of out) { joined.set(segment.samples, at); at += segment.samples.length; }
  assert.deepEqual(joined, copy);
});

test('rejects unusable sample rates', () => {
  assert.throws(() => createVoiceSegmenter(0, () => {}));
  assert.throws(() => createVoiceSegmenter(1000, () => {}));
});
