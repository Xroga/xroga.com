// The sound side of a composed video, as pure functions over samples: the shapes of a fade (editly offers ffmpeg's fade curves for the sound that crosses from one clip to the next),
// a change of speed that keeps the pitch (editly's atempo), and loudness normalisation to a target (editly's audioNorm; the measure is BS.1770 from media-analysis.ts).
// Written fresh; tested with tones whose frequency and loudness are known.
import { integratedLoudness } from './media-analysis';

export const FADE_CURVES = ['tri', 'qsin', 'hsin', 'qua', 'cub', 'squ', 'cbr', 'par', 'exp', 'log', 'nofade'] as const;
export type FadeCurve = (typeof FADE_CURVES)[number];

/** The gain of a fade-in at `x` (0 to 1); a fade-out uses the mirror, curve(1 - x). */
export function fadeCurve(name: string, x: number): number {
  const t = Math.min(1, Math.max(0, x));
  switch (name) {
    case 'qsin':
      return Math.sin((t * Math.PI) / 2);
    case 'hsin':
      return (1 - Math.cos(t * Math.PI)) / 2;
    case 'qua':
      return t * t;
    case 'cub':
      return t * t * t;
    case 'squ':
      return Math.sqrt(t);
    case 'cbr':
      return Math.cbrt(t);
    case 'par':
      return t * (2 - t);
    case 'exp':
      return (Math.exp(t) - 1) / (Math.E - 1);
    case 'log':
      return Math.log1p(9 * t) / Math.log(10);
    case 'nofade':
      return 1;
    default:
      return t;
  }
}

/** Gains for the outgoing and the incoming sound over a cross-fade, `points` values each. */
export function crossfadeGains(outCurve: string, inCurve: string, points = 128): { out: Float32Array; in: Float32Array } {
  const out = new Float32Array(points);
  const into = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const x = points === 1 ? 1 : i / (points - 1);
    out[i] = fadeCurve(outCurve, 1 - x);
    into[i] = fadeCurve(inCurve, x);
  }
  return { out, in: into };
}

/**
 * Changes the speed of sound by `rate` (2 is twice as fast, 0.5 half) without changing its pitch: waveform-similarity overlap-add. The best place to join each piece is
 * found on the first channel and used for all, so stereo stays in phase. Output length is input length divided by `rate`.
 */
export function timeStretch(channels: Float32Array[], rate: number, sampleRate: number): Float32Array[] {
  if (!channels.length) return [];
  const r = Math.min(4, Math.max(0.25, rate));
  const length = channels[0]!.length;
  if (Math.abs(r - 1) < 0.005 || length < 2048) return channels.map(c => c.slice());
  const frame = Math.max(512, Math.round(sampleRate * 0.04));
  const outHop = Math.floor(frame / 2);
  const inHop = outHop * r;
  const search = Math.round(sampleRate * 0.012);
  const outLength = Math.floor(length / r);
  const window = new Float32Array(frame).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / frame));
  const out = channels.map(() => new Float32Array(outLength + frame));
  const norm = new Float32Array(outLength + frame);
  const lead = channels[0]!;
  let previousEnd = 0; // where the last piece's natural continuation starts in the input
  for (let o = 0, k = 0; o < outLength; o += outHop, k++) {
    const nominal = Math.round(k * inHop);
    let pos = nominal;
    if (k > 0) {
      // the offset within +-search whose start best continues the last piece
      let best = -Infinity;
      for (let d = -search; d <= search; d += 2) {
        const start = nominal + d;
        if (start < 0 || start + frame > length) continue;
        let s = 0;
        for (let i = 0; i < outHop; i += 3) s += lead[previousEnd + i]! * lead[start + i]!;
        if (s > best) {
          best = s;
          pos = start;
        }
      }
    }
    if (pos + frame > length) break;
    for (let c = 0; c < channels.length; c++) {
      const src = channels[c]!;
      const dst = out[c]!;
      for (let i = 0; i < frame; i++) dst[o + i]! += src[pos + i]! * window[i]!;
    }
    for (let i = 0; i < frame; i++) norm[o + i]! += window[i]!;
    previousEnd = pos + outHop;
  }
  return out.map(dst => {
    const result = new Float32Array(outLength);
    for (let i = 0; i < outLength; i++) result[i] = norm[i]! > 1e-3 ? dst[i]! / norm[i]! : 0;
    return result;
  });
}

/** The gain (linear) that brings the sound to `targetLufs`, never more than `maxGainDb` up, and null when it is too quiet to measure. */
export function normalizationGain(channels: Float32Array[], sampleRate: number, targetLufs = -16, maxGainDb = 30): number | null {
  const measured = integratedLoudness(channels, sampleRate);
  if (measured === null) return null;
  const db = Math.min(maxGainDb, targetLufs - measured);
  return 10 ** (db / 20);
}

/** Gain with a soft knee at the top: nothing goes past full scale, and quiet parts are untouched. */
export function applyGainSoftLimit(channels: Float32Array[], gain: number, ceiling = 0.98): void {
  const knee = ceiling * 0.8;
  for (const c of channels) {
    for (let i = 0; i < c.length; i++) {
      const x = c[i]! * gain;
      const a = Math.abs(x);
      c[i] = a <= knee ? x : Math.sign(x) * (knee + (ceiling - knee) * Math.tanh((a - knee) / (ceiling - knee)));
    }
  }
}
