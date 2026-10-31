/** Streaming cutter for dictation audio. Segments never overlap and every
 * captured sample belongs to exactly one segment, so merging needs no text
 * de-duplication that could delete a phrase the speaker really repeated.
 * Each cut lands on the quietest 50 ms frame in the last part of the window.
 */
export const SEGMENT_TARGET_SECONDS = 25;
export const SEGMENT_SEARCH_FROM_SECONDS = 18;
const FRAME_SECONDS = 0.05;
/** A window that mixes languages is decoded under one language, which can silently drop the other
 * language's speech. Cutting at a real pause once a segment is long enough keeps segments short and
 * mostly single-language. Measured on human speech: 6 s keeps single-language accuracy unchanged and
 * keeps the English part of mixed windows (about 96% recall versus 0-98%); 4 s hurt Hindi and 8 s missed
 * switches. A pause is at least PAUSE_SECONDS long and quieter than 3% of the speech energy. */
export const PAUSE_CUT_MIN_SECONDS = 6;
export const PAUSE_SECONDS = 0.35;
const PAUSE_RELATIVE_ENERGY = 0.03;
const PAUSE_FRAME_SECONDS = 0.02;

export interface VoiceSegment {
  seq: number;
  samples: Float32Array;
  rate: number;
  startSeconds: number;
  endSeconds: number;
}

export function quietCutIndex(samples: Float32Array, rate: number): number {
  const frame = Math.max(1, Math.round(rate * FRAME_SECONDS));
  let best = Infinity, cut = samples.length;
  for (let at = Math.round(rate * SEGMENT_SEARCH_FROM_SECONDS); at + frame <= samples.length; at += frame) {
    let energy = 0;
    for (let i = at; i < at + frame; i++) energy += samples[i] * samples[i];
    if (energy < best) { best = energy; cut = at + Math.floor(frame / 2); }
  }
  return cut;
}

/** Index to cut at, in the middle of the first pause that starts after PAUSE_CUT_MIN_SECONDS, or -1. */
export function pauseCutIndex(samples: Float32Array, rate: number): number {
  const frame = Math.max(1, Math.round(rate * PAUSE_FRAME_SECONDS));
  const frames = Math.floor(samples.length / frame);
  const need = Math.ceil(PAUSE_SECONDS / PAUSE_FRAME_SECONDS), first = Math.ceil(PAUSE_CUT_MIN_SECONDS / PAUSE_FRAME_SECONDS);
  if (frames < first + need + 5) return -1;
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * frame; i < (f + 1) * frame; i++) sum += samples[i] * samples[i];
    energy[f] = sum / frame;
  }
  const sorted = Array.from(energy).sort((x, y) => x - y);
  const speech = sorted[Math.floor(sorted.length * 0.9)];
  if (!(speech > 1e-6)) return -1; // essentially silent: nothing to align to
  const quiet = speech * PAUSE_RELATIVE_ENERGY;
  let run = 0;
  for (let f = first; f < frames - 2; f++) {
    run = energy[f] < quiet ? run + 1 : 0;
    if (run >= need) return Math.floor((f - Math.floor(need / 2)) * frame + frame / 2);
  }
  return -1;
}

export function createVoiceSegmenter(rate: number, emit: (segment: VoiceSegment) => void) {
  if (!Number.isFinite(rate) || rate < 8000 || rate > 192000) throw new Error('Unsupported microphone sample rate.');
  let pending: Float32Array[] = [], buffered = 0, seq = 0, emitted = 0;
  const join = () => {
    const all = new Float32Array(buffered);
    let at = 0;
    for (const chunk of pending) { all.set(chunk, at); at += chunk.length; }
    return all;
  };
  const release = (all: Float32Array, cut: number) => {
    const head = all.slice(0, cut), rest = all.slice(cut);
    emit({ seq: seq++, samples: head, rate, startSeconds: emitted / rate, endSeconds: (emitted + cut) / rate });
    emitted += cut;
    pending = rest.length ? [rest] : [];
    buffered = rest.length;
    all.fill(0);
  };
  return {
    push(chunk: Float32Array) {
      if (!chunk.length) return;
      pending.push(chunk);
      buffered += chunk.length;
      if (buffered >= rate * SEGMENT_TARGET_SECONDS) {
        const all = join();
        release(all, quietCutIndex(all, rate));
      } else if (buffered >= rate * (PAUSE_CUT_MIN_SECONDS + PAUSE_SECONDS + 0.2)) {
        const all = join();
        const cut = pauseCutIndex(all, rate);
        if (cut > 0) release(all, cut);
      }
    },
    /** Emits the remaining audio. Call once, after the microphone has stopped. */
    flush() {
      if (!buffered) return;
      const all = join();
      release(all, all.length);
    },
    get seconds() { return (emitted + buffered) / rate; },
  };
}
