// What a model cannot hear or see in a media file, worked out from the decoded sound and picture: where it is silent, how loud it is, its shape over time, its tempo and
// beats, and where the picture cuts. Pure functions over numbers, so they are tested without a browser; src/extension/media.ts and the offscreen document do the decoding.
// The kinds of analysis come from reading cutline (MIT; silence, loudness, waveform, beats, scenes as perception tools for an editing agent); the code is written fresh,
// the loudness follows ITU-R BS.1770 (K-weighting and gating) and the beat tracker follows D. Ellis, "Beat Tracking by Dynamic Programming" (2007).

import { downbeats as pickDownbeats } from './transcript-tools';

export const toDb = (amplitude: number): number => (amplitude <= 1e-5 ? -100 : 20 * Math.log10(amplitude));
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

export interface Envelope {
  windowSec: number;
  rms: number[];
  peak: number[];
}

/** One RMS and one peak value (linear, 0 to 1) per window of the sound. */
export function computeEnvelope(samples: ArrayLike<number>, sampleRate: number, windowSec = 0.05): Envelope {
  const size = Math.max(1, Math.round(sampleRate * windowSec));
  const rms: number[] = [];
  const peak: number[] = [];
  for (let i = 0; i < samples.length; i += size) {
    const end = Math.min(samples.length, i + size);
    let sum = 0;
    let max = 0;
    for (let j = i; j < end; j++) {
      const v = samples[j]!;
      sum += v * v;
      if (Math.abs(v) > max) max = Math.abs(v);
    }
    rms.push(Math.sqrt(sum / (end - i)));
    peak.push(max);
  }
  return { windowSec: size / sampleRate, rms, peak };
}

export interface Range {
  start: number;
  end: number;
}

/** Stretches where the sound stays under `thresholdDb` for at least `minSeconds`. */
export function detectSilences(env: Envelope, options: { thresholdDb?: number; minSeconds?: number } = {}): Range[] {
  const threshold = options.thresholdDb ?? -40;
  const min = options.minSeconds ?? 0.5;
  const total = env.rms.length * env.windowSec;
  const out: Range[] = [];
  let from = -1;
  for (let i = 0; i <= env.rms.length; i++) {
    const quiet = i < env.rms.length && toDb(env.rms[i]!) < threshold;
    if (quiet && from < 0) from = i;
    if (!quiet && from >= 0) {
      const start = from * env.windowSec;
      const end = Math.min(total, i * env.windowSec);
      if (end - start >= min) out.push({ start: round(start), end: round(end) });
      from = -1;
    }
  }
  return out;
}

const BARS = '▁▂▃▄▅▆▇█';
/** The loudness over time as one line of block characters (quiet to loud, from -60 dB to 0 dB). */
export function waveformLine(env: Envelope, columns = 60): string {
  if (!env.peak.length) return '';
  const n = Math.min(columns, env.peak.length);
  let out = '';
  for (let c = 0; c < n; c++) {
    const a = Math.floor((c * env.peak.length) / n);
    const b = Math.max(a + 1, Math.floor(((c + 1) * env.peak.length) / n));
    let m = 0;
    for (let i = a; i < b; i++) m = Math.max(m, env.peak[i]!);
    const level = Math.min(1, Math.max(0, (toDb(m) + 60) / 60));
    out += BARS[Math.min(BARS.length - 1, Math.floor(level * BARS.length))];
  }
  return out;
}

interface Biquad {
  b: [number, number, number];
  a: [number, number];
}

/** The two filters of BS.1770's K-weighting (a high shelf and a high-pass) for a given sample rate. */
export function kWeightingFilters(sampleRate: number): Biquad[] {
  const shelf = (() => {
    const f0 = 1681.974450955533;
    const gain = 3.999843853973347;
    const q = 0.7071752369554196;
    const k = Math.tan((Math.PI * f0) / sampleRate);
    const vh = 10 ** (gain / 20);
    const vb = vh ** 0.4996667741545416;
    const a0 = 1 + k / q + k * k;
    return { b: [(vh + (vb * k) / q + k * k) / a0, (2 * (k * k - vh)) / a0, (vh - (vb * k) / q + k * k) / a0] as [number, number, number], a: [(2 * (k * k - 1)) / a0, (1 - k / q + k * k) / a0] as [number, number] };
  })();
  const high = (() => {
    const f0 = 38.13547087602444;
    const q = 0.5003270373238773;
    const k = Math.tan((Math.PI * f0) / sampleRate);
    const a0 = 1 + k / q + k * k;
    return { b: [1, -2, 1] as [number, number, number], a: [(2 * (k * k - 1)) / a0, (1 - k / q + k * k) / a0] as [number, number] };
  })();
  return [shelf, high];
}

function filter(x: Float32Array | Float64Array, f: Biquad): Float64Array {
  const y = new Float64Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = f.b[0] * x[i]! + f.b[1] * x1 + f.b[2] * x2 - f.a[0] * y1 - f.a[1] * y2;
    x2 = x1;
    x1 = x[i]!;
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/** Integrated loudness in LUFS (BS.1770: K-weighted, 400 ms blocks with 75% overlap, absolute gate -70, relative gate -10). Null when nothing is loud enough to count. */
export function integratedLoudness(channels: Array<Float32Array | Float64Array>, sampleRate: number): number | null {
  if (!channels.length || !channels[0]!.length) return null;
  const filters = kWeightingFilters(sampleRate);
  const weighted = channels.map(c => filters.reduce<Float64Array>((x, f) => filter(x, f), Float64Array.from(c)));
  const block = Math.round(0.4 * sampleRate);
  const hop = Math.round(0.1 * sampleRate);
  const powers: number[] = [];
  for (let start = 0; start + block <= weighted[0]!.length; start += hop) {
    let z = 0;
    for (const ch of weighted) {
      let sum = 0;
      for (let i = start; i < start + block; i++) sum += ch[i]! * ch[i]!;
      z += sum / block;
    }
    powers.push(z);
  }
  if (!powers.length) return null;
  const lufs = (z: number) => -0.691 + 10 * Math.log10(z);
  const above = powers.filter(z => z > 0 && lufs(z) > -70);
  if (!above.length) return null;
  const relative = lufs(above.reduce((s, z) => s + z, 0) / above.length) - 10;
  const kept = above.filter(z => lufs(z) > relative);
  if (!kept.length) return null;
  return round(lufs(kept.reduce((s, z) => s + z, 0) / kept.length), 1);
}

/** Highest sample of any channel, in dB full scale. */
export function samplePeakDb(channels: Array<ArrayLike<number>>): number {
  let m = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) if (Math.abs(c[i]!) > m) m = Math.abs(c[i]!);
  return round(toDb(m), 1);
}

/** Average of the channels, one sample per frame. */
export function toMono(channels: Array<Float32Array>): Float32Array {
  if (channels.length === 1) return channels[0]!;
  const out = new Float32Array(channels[0]!.length);
  for (const c of channels) for (let i = 0; i < out.length; i++) out[i]! += (c[i] ?? 0) / channels.length;
  return out;
}

/** Every `factor`-th block averaged: a cheap lowering of the sample rate for analyses that need no treble. */
export function decimate(samples: Float32Array, factor: number): Float32Array {
  if (factor <= 1) return samples;
  const out = new Float32Array(Math.floor(samples.length / factor));
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (let j = 0; j < factor; j++) s += samples[i * factor + j]!;
    out[i] = s / factor;
  }
  return out;
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

export interface Beats {
  /** The beats that most likely start a bar (4/4), when the pattern is clear. */
  downbeats?: number[];
  bpm: number;
  /** 0 to 1: how regular the onsets are at that tempo. */
  confidence: number;
  beats: number[];
}

const FRAME = 512;
const HOP = 110;

/** Spectral flux of the log magnitude (the rise of energy in each frame), with the slow average taken out. */
export function onsetStrength(samples: Float32Array): Float64Array {
  const frames = Math.max(0, Math.floor((samples.length - FRAME) / HOP) + 1);
  const bins = FRAME / 2;
  const window = new Float64Array(FRAME).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME));
  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  let prev = new Float64Array(bins);
  let cur = new Float64Array(bins);
  const flux = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < FRAME; i++) {
      re[i] = samples[f * HOP + i]! * window[i]!;
      im[i] = 0;
    }
    fft(re, im);
    let sum = 0;
    for (let k = 1; k < bins; k++) {
      cur[k] = Math.log1p(100 * Math.hypot(re[k]!, im[k]!));
      if (f > 0) sum += Math.max(0, cur[k]! - prev[k]!);
    }
    flux[f] = sum;
    [prev, cur] = [cur, prev];
  }
  const half = 20;
  const prefix = new Float64Array(frames + 1);
  for (let i = 0; i < frames; i++) prefix[i + 1] = prefix[i]! + flux[i]!;
  const out = new Float64Array(frames);
  for (let i = 0; i < frames; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(frames, i + half + 1);
    out[i] = Math.max(0, flux[i]! - (prefix[b]! - prefix[a]!) / (b - a));
  }
  return out;
}

/** Tempo and beat times of mono sound at `sampleRate` (best at 8 to 16 kHz): onsets, a tempo from their autocorrelation, then the beat path that best fits onsets and tempo. */
export function trackBeats(samples: Float32Array, sampleRate: number, options: { minBpm?: number; maxBpm?: number } = {}): Beats {
  const onset = onsetStrength(samples);
  const hopSec = HOP / sampleRate;
  if (onset.length < 4 * Math.ceil(1 / hopSec)) return { bpm: 0, confidence: 0, beats: [] };
  // Beats are strong, sparse peaks. A steady tone gives a ripple of rounding size (about 0.7, against 20 for noise and 1000 for clicks) and a hiss a dense one; either is regular only by accident, so refuse it rather than report a tempo.
  let top = 0;
  for (let i = 0; i < onset.length; i++) if (onset[i]! > top) top = onset[i]!;
  let strong = 0;
  for (let i = 0; i < onset.length; i++) if (onset[i]! > 0.5 * top) strong++;
  if (top < 3 || strong / onset.length > 0.35) return { bpm: 0, confidence: 0, beats: [] };
  const minBpm = options.minBpm ?? 60;
  const maxBpm = options.maxBpm ?? 200;
  const loLag = Math.max(2, Math.floor(60 / (maxBpm * hopSec)));
  const hiLag = Math.min(onset.length - 1, Math.ceil(60 / (minBpm * hopSec)));
  const ac = new Float64Array(hiLag + 1);
  let zero = 0;
  for (let i = 0; i < onset.length; i++) zero += onset[i]! * onset[i]!;
  if (zero <= 0) return { bpm: 0, confidence: 0, beats: [] };
  for (let lag = loLag - 1; lag <= hiLag; lag++) {
    let s = 0;
    for (let i = lag; i < onset.length; i++) s += onset[i]! * onset[i - lag]!;
    ac[lag] = s / zero;
  }
  // a mild preference for tempi near 120 keeps the answer from jumping to half or double time
  let bestLag = loLag;
  let best = -Infinity;
  for (let lag = loLag; lag <= hiLag; lag++) {
    const bpm = 60 / (lag * hopSec);
    const weight = Math.exp(-0.5 * (Math.log2(bpm / 120) / 1.0) ** 2);
    const score = ac[lag]! * weight;
    if (score > best) {
      best = score;
      bestLag = lag;
    }
  }
  // refine to a fraction of a frame
  const l0 = ac[bestLag - 1] ?? 0;
  const l1 = ac[bestLag]!;
  const l2 = ac[bestLag + 1] ?? 0;
  const denom = l0 - 2 * l1 + l2;
  const period = bestLag + (denom !== 0 ? (0.5 * (l0 - l2)) / denom : 0);
  // beat path by dynamic programming: each beat is one period after the last, and sits on a strong onset
  const tight = 100;
  const score = new Float64Array(onset.length);
  const back = new Int32Array(onset.length).fill(-1);
  for (let t = 0; t < onset.length; t++) {
    let top = 0;
    let from = -1;
    for (let p = Math.max(0, Math.round(t - 2 * period)); p <= Math.round(t - period / 2); p++) {
      const delta = t - p;
      if (delta <= 0) continue;
      const s = score[p]! - tight * Math.log(delta / period) ** 2;
      if (s > top || from < 0) {
        top = s;
        from = p;
      }
    }
    score[t] = onset[t]! + (from >= 0 ? Math.max(0, top) : 0);
    back[t] = from;
  }
  let end = 0;
  const tailStart = Math.max(0, onset.length - Math.ceil(period));
  for (let t = tailStart; t < onset.length; t++) if (score[t]! > score[end]!) end = t;
  const frames: number[] = [];
  for (let t = end; t >= 0; t = back[t]!) {
    frames.push(t);
    if (back[t]! < 0) break;
  }
  frames.reverse();
  const beats = frames.map(f => round(f * hopSec + FRAME / 2 / sampleRate, 3));
  const gaps = beats.slice(1).map((b, i) => b - beats[i]!);
  const mean = gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length : 0;
  const bpm = mean > 0 ? round(60 / mean, 1) : round(60 / (period * hopSec), 1);
  const variance = gaps.length ? gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length : 1;
  const confidence = round(Math.max(0, Math.min(1, ac[bestLag]! * 2, 1 - Math.sqrt(variance) / (mean || 1))), 2);
  // the strength of the onset at each beat: the beat that starts a bar is usually the strongest of its four
  const strength = frames.map(f => {
    let m = 0;
    for (let k = Math.max(0, f - 2); k <= Math.min(onset.length - 1, f + 2); k++) m = Math.max(m, onset[k]!);
    return m;
  });
  const bars = pickDownbeats(beats, strength);
  return { bpm, confidence, beats, ...(bars.length ? { downbeats: bars } : {}) };
}

/** Mean absolute difference (0 to 1) between two small grey pictures. */
export function frameDifference(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(a[i]! - b[i]!);
  return s / n / 255;
}

/**
 * The times where the picture jumps: a frame that differs from the one before by at least `threshold` (default 0.10), is the largest change of its neighbours, and is at least twice the
 * usual change around it (the median of the four before and the four after, so a busy action scene does not hide its own cuts the way an average would).
 */
export function detectCuts(times: number[], diffs: number[], threshold = 0.1): number[] {
  const out: number[] = [];
  for (let i = 0; i < diffs.length; i++) {
    const d = diffs[i]!;
    if (d < threshold || d < (diffs[i - 1] ?? 0) || d < (diffs[i + 1] ?? 0)) continue;
    const around = diffs.slice(Math.max(0, i - 4), i).concat(diffs.slice(i + 1, i + 5)).sort((x, y) => x - y);
    const usual = around.length ? around[Math.floor(around.length / 2)]! : 0;
    if (d >= 2 * usual && (out.length === 0 || times[i]! - out[out.length - 1]! > 0.4)) out.push(round(times[i]!, 2));
  }
  return out;
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds * 10) / 10);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(r % 1 ? 1 : 0)}`;
}

export interface AudioReport {
  seconds: number;
  sampleRate: number;
  channels: number;
  loudnessLufs: number | null;
  peakDb: number;
  rmsDb: number;
  silences: Range[];
  line: string;
}

export function describeAudio(r: AudioReport, options: { thresholdDb: number; minSeconds: number; from?: number }): string {
  const out = [`Sound ${options.from ? `from ${clock(options.from)} for ` : 'of '}${clock(r.seconds)} (${r.channels} channel${r.channels === 1 ? '' : 's'}, ${r.sampleRate} Hz): ${r.loudnessLufs === null ? 'too quiet to measure' : `integrated loudness ${r.loudnessLufs} LUFS`}, sample peak ${r.peakDb} dBFS, average level ${r.rmsDb} dBFS.`];
  out.push(`Level over time (quiet ▁ to loud █): ${r.line}`);
  if (!r.silences.length) out.push(`No silence of ${options.minSeconds} s or more below ${options.thresholdDb} dB.`);
  else {
    const total = r.silences.reduce((s, x) => s + x.end - x.start, 0);
    out.push(`${r.silences.length} silence${r.silences.length === 1 ? '' : 's'} of ${options.minSeconds} s or more below ${options.thresholdDb} dB (${round(total, 1)} s in all): ${r.silences.slice(0, 40).map(s => `${clock(s.start)}–${clock(s.end)}`).join(', ')}${r.silences.length > 40 ? ', …' : ''}`);
  }
  return out.join('\n');
}

export function describeBeats(b: Beats, seconds: number, from = 0): string {
  const part = from ? `${clock(seconds)} from ${clock(from)}` : clock(seconds);
  if (!b.beats.length || b.bpm <= 0) return `No steady beat found in ${part} (speech, ambience or too short).`;
  const shown = b.beats.slice(0, 48).map(t => clock(t)).join(' ');
  const bars = b.downbeats?.length ? ` Bars (4/4) probably start at ${b.downbeats.slice(0, 16).map(t => clock(t)).join(' ')}${b.downbeats.length > 16 ? ' …' : ''}.` : '';
  return `Tempo about ${b.bpm} BPM (regularity ${b.confidence}), ${b.beats.length} beats in ${part}.${bars} Beat times: ${shown}${b.beats.length > 48 ? ' …' : ''}`;
}

export function describeScenes(cuts: number[], seconds: number, sampled: number, from = 0): string {
  const part = from ? `${clock(seconds)} from ${clock(from)}` : clock(seconds);
  if (!cuts.length) return `No cut found in ${part} (${sampled} frames compared): one continuous shot, or only slow changes.`;
  return `${cuts.length} cut${cuts.length === 1 ? '' : 's'} in ${part} (${sampled} frames compared): ${cuts.slice(0, 80).map(clock).join(', ')}${cuts.length > 80 ? ', …' : ''}. Shots: ${cuts.length + 1}.`;
}
