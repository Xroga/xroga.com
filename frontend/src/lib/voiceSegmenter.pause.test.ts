import assert from 'node:assert/strict';
import test from 'node:test';
import {createVoiceSegmenter, pauseCutIndex, PAUSE_CUT_MIN_SECONDS, type VoiceSegment} from './voiceSegmenter';

const RATE = 16000;
/** Loud tone with silent gaps (seconds) of the given length at the given start times. */
function speech(seconds: number, gaps: Array<[number, number]> = [], floor = 0) {
  const out = new Float32Array(Math.round(seconds * RATE));
  let seed = 1;
  for (let i = 0; i < out.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; out[i] = 0.3 * Math.sin(i / 10) + floor * ((seed / 2 ** 32) - 0.5); }
  for (const [at, length] of gaps) for (let i = Math.round(at * RATE); i < Math.round((at + length) * RATE) && i < out.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; out[i] = floor * ((seed / 2 ** 32) - 0.5); }
  return out;
}
const run = (audio: Float32Array, step = 2048) => {
  const out: VoiceSegment[] = [];
  const segmenter = createVoiceSegmenter(RATE, segment => out.push(segment));
  for (let at = 0; at < audio.length; at += step) segmenter.push(audio.slice(at, at + step));
  segmenter.flush();
  return out;
};

test('a real pause after the minimum length cuts the segment there so each part can be decoded in its own language', () => {
  const out = run(speech(20, [[11.6, 0.5]]));
  assert.equal(out.length, 2);
  assert.ok(out[0].samples.length / RATE > 11.6 && out[0].samples.length / RATE < 12.2, String(out[0].samples.length / RATE));
  assert.equal(out.reduce((sum, segment) => sum + segment.samples.length, 0), 20 * RATE, 'no sample lost or duplicated');
});

test('pauses before the minimum length, short pauses and continuous speech do not add cuts', () => {
  assert.equal(run(speech(20, [[4, 0.6]])).length, 1, 'early pause ignored');
  assert.equal(run(speech(20, [[12, 0.2]])).length, 1, 'a 0.2 s gap is not a pause');
  assert.equal(run(speech(20)).length, 1, 'continuous speech is one segment');
  assert.equal(run(speech(40, [[22, 0.2]])).length, 2, 'the 25 s rule is unchanged');
});

test('a pause is found in a noisy room because it is judged against the speech level, not silence', () => {
  const noisy = speech(20, [[11, 0.6]], 0.02);
  const cut = pauseCutIndex(noisy, RATE);
  assert.ok(cut / RATE > 11 && cut / RATE < 11.7, String(cut / RATE));
  assert.equal(pauseCutIndex(speech(20, [], 0.02), RATE), -1);
});

test('digital silence or a very quiet recording never triggers a cut', () => {
  assert.equal(pauseCutIndex(new Float32Array(RATE * 20), RATE), -1);
  assert.equal(pauseCutIndex(new Float32Array(RATE * 20).fill(0.0001), RATE), -1);
});

test('several pauses produce several segments, all contiguous and each at least the minimum length', () => {
  const out = run(speech(40, [[10, 0.5], [20, 0.5], [30, 0.5]]));
  assert.ok(out.length >= 3 && out.length <= 5, String(out.length));
  out.slice(0, -1).forEach(segment => assert.ok(segment.samples.length / RATE >= PAUSE_CUT_MIN_SECONDS));
  out.forEach((segment, i) => { if (i) assert.equal(segment.startSeconds, out[i - 1].endSeconds); });
});
