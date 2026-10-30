/** Streaming cutter for dictation audio. Segments never overlap and every
 * captured sample belongs to exactly one segment, so merging needs no text
 * de-duplication that could delete a phrase the speaker really repeated.
 * Each cut lands on the quietest 50 ms frame in the last part of the window.
 */
export const SEGMENT_TARGET_SECONDS = 25;
export const SEGMENT_SEARCH_FROM_SECONDS = 18;
const FRAME_SECONDS = 0.05;

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
