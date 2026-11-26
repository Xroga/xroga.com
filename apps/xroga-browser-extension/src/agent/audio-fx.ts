// Sound treatment for compose_video: an equaliser, filters, a compressor, reverb, an echo and noise reduction that learns the noise from the quietest stretch of the sound itself. The vocabulary
// (the bands, the focus of a noise filter such as speech, hum or wind, the room-size and damping of a reverb) comes from reading openreel (MIT) audio engine; the maths below is written fresh
// and tested alone: the noise reduction is spectral subtraction with a Hann window and 75 % overlap, the reverb impulse is a decaying noise from a seeded generator.

export type BandType = 'lowshelf' | 'highshelf' | 'peaking' | 'lowpass' | 'highpass' | 'notch' | 'bandpass';

export interface EqBand {
  type: BandType;
  frequency: number;
  gain: number;
  q: number;
}

export type NoiseFocus = 'balanced' | 'speech' | 'whiteNoise' | 'music' | 'heavy' | 'wind' | 'hum';

export interface AudioFx {
  /** Level change in dB, applied last. */
  gain?: number;
  highpass?: number;
  lowpass?: number;
  eq?: EqBand[];
  compressor?: { threshold: number; ratio: number; attack: number; release: number; knee: number; makeup: number };
  reverb?: { roomSize: number; damping: number; wet: number; dry: number; preDelay: number };
  delay?: { time: number; feedback: number; wet: number };
  denoise?: { focus: NoiseFocus; amount: number; noiseFrom?: number; noiseSeconds: number };
}

const num = (v: unknown, d: number, lo: number, hi: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/** Named looks for the equaliser. */
export const EQ_PRESETS: Record<string, EqBand[]> = {
  voice: [
    { type: 'highpass', frequency: 80, gain: 0, q: 0.7 },
    { type: 'peaking', frequency: 250, gain: -2, q: 1 },
    { type: 'peaking', frequency: 3000, gain: 3, q: 0.9 },
    { type: 'highshelf', frequency: 9000, gain: 1.5, q: 0.7 },
  ],
  podcast: [
    { type: 'highpass', frequency: 70, gain: 0, q: 0.7 },
    { type: 'lowshelf', frequency: 150, gain: 2, q: 0.7 },
    { type: 'peaking', frequency: 400, gain: -2.5, q: 1.2 },
    { type: 'peaking', frequency: 4000, gain: 2.5, q: 1 },
  ],
  warm: [
    { type: 'lowshelf', frequency: 200, gain: 3, q: 0.7 },
    { type: 'highshelf', frequency: 6000, gain: -3, q: 0.7 },
  ],
  bright: [
    { type: 'lowshelf', frequency: 150, gain: -2, q: 0.7 },
    { type: 'highshelf', frequency: 5000, gain: 4, q: 0.7 },
  ],
  telephone: [
    { type: 'highpass', frequency: 400, gain: 0, q: 0.9 },
    { type: 'lowpass', frequency: 3400, gain: 0, q: 0.9 },
    { type: 'peaking', frequency: 1500, gain: 4, q: 1 },
  ],
  bassboost: [{ type: 'lowshelf', frequency: 120, gain: 6, q: 0.7 }],
};

const BAND_TYPES: readonly BandType[] = ['lowshelf', 'highshelf', 'peaking', 'lowpass', 'highpass', 'notch', 'bandpass'];

/** What each noise focus does after the spectral step: the filters that follow, and the floor of the reduction (a lower floor takes more out). */
export const NOISE_FOCUS: Record<NoiseFocus, { floor: number; post: EqBand[] }> = {
  balanced: { floor: 0.2, post: [{ type: 'highpass', frequency: 55, gain: 0, q: 0.6 }] },
  speech: { floor: 0.25, post: [{ type: 'highpass', frequency: 65, gain: 0, q: 0.7 }, { type: 'peaking', frequency: 2800, gain: 1.5, q: 0.95 }] },
  whiteNoise: { floor: 0.08, post: [{ type: 'highpass', frequency: 70, gain: 0, q: 0.7 }, { type: 'highshelf', frequency: 5200, gain: -6, q: 0.7 }, { type: 'lowpass', frequency: 15500, gain: 0, q: 0.7 }] },
  music: { floor: 0.15, post: [{ type: 'highpass', frequency: 90, gain: 0, q: 0.75 }, { type: 'peaking', frequency: 3000, gain: 2, q: 0.9 }] },
  heavy: { floor: 0.06, post: [{ type: 'highpass', frequency: 70, gain: 0, q: 0.7 }, { type: 'highshelf', frequency: 7000, gain: -4, q: 0.7 }, { type: 'lowpass', frequency: 14500, gain: 0, q: 0.7 }] },
  wind: { floor: 0.1, post: [{ type: 'highpass', frequency: 110, gain: 0, q: 0.8 }, { type: 'lowshelf', frequency: 180, gain: -6, q: 0.8 }] },
  hum: { floor: 0.2, post: [{ type: 'highpass', frequency: 70, gain: 0, q: 0.7 }, { type: 'notch', frequency: 50, gain: 0, q: 18 }, { type: 'notch', frequency: 60, gain: 0, q: 18 }, { type: 'notch', frequency: 100, gain: 0, q: 14 }, { type: 'notch', frequency: 120, gain: 0, q: 14 }, { type: 'notch', frequency: 180, gain: 0, q: 10 }] },
};

/**
 * Reads the `fx` of a sound or a video's sound. eq is a list of bands or a preset name; compressor, reverb, delay and denoise take true for the defaults or the numbers named.
 * Anything else is dropped; an empty result is undefined.
 */
export function normalizeFx(raw: unknown): AudioFx | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const fx: AudioFx = {};
  if (typeof r.gain === 'number' && Number.isFinite(r.gain)) fx.gain = num(r.gain, 0, -40, 24);
  if (typeof r.highpass === 'number') fx.highpass = num(r.highpass, 80, 20, 2000);
  if (typeof r.lowpass === 'number') fx.lowpass = num(r.lowpass, 12000, 1000, 20000);
  if (typeof r.eq === 'string' && EQ_PRESETS[r.eq]) fx.eq = EQ_PRESETS[r.eq]!.map(b => ({ ...b }));
  else if (Array.isArray(r.eq)) {
    const bands = r.eq.slice(0, 12).flatMap((b: unknown) => {
      const k = b as Record<string, unknown>;
      return BAND_TYPES.includes(k?.type as BandType) ? [{ type: k.type as BandType, frequency: num(k.frequency, 1000, 20, 20000), gain: num(k.gain, 0, -24, 24), q: num(k.q, 1, 0.1, 18) }] : [];
    });
    if (bands.length) fx.eq = bands;
  }
  const obj = (v: unknown): Record<string, unknown> | undefined => (v === true ? {} : v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined);
  const comp = obj(r.compressor);
  if (comp) fx.compressor = { threshold: num(comp.threshold, -24, -60, 0), ratio: num(comp.ratio, 4, 1, 20), attack: num(comp.attack, 0.003, 0.001, 1), release: num(comp.release, 0.25, 0.01, 3), knee: num(comp.knee, 30, 0, 40), makeup: num(comp.makeup ?? comp.makeupGain, 0, 0, 24) };
  const rev = obj(r.reverb);
  if (rev) fx.reverb = { roomSize: num(rev.roomSize, 0.4, 0, 1), damping: num(rev.damping, 0.5, 0, 1), wet: num(rev.wet ?? rev.wetLevel, 0.25, 0, 1), dry: num(rev.dry ?? rev.dryLevel, 0.8, 0, 1), preDelay: num(rev.preDelay, 0, 0, 100) };
  const del = obj(r.delay ?? r.echo);
  if (del) fx.delay = { time: num(del.time, 0.35, 0.02, 2), feedback: num(del.feedback, 0.3, 0, 0.9), wet: num(del.wet ?? del.wetLevel, 0.3, 0, 1) };
  const dn = obj(r.denoise ?? r.noiseReduction);
  if (dn) fx.denoise = { focus: (dn.focus as NoiseFocus) in NOISE_FOCUS ? (dn.focus as NoiseFocus) : 'speech', amount: num(dn.amount, 0.6, 0, 1), ...(typeof dn.noiseFrom === 'number' ? { noiseFrom: Math.max(0, dn.noiseFrom) } : {}), noiseSeconds: num(dn.noiseSeconds, 0.6, 0.15, 5) };
  return Object.keys(fx).length ? fx : undefined;
}

/** Seconds the treatment adds after the end of the sound (reverb and echo tails). */
export function fxTail(fx: AudioFx): number {
  let tail = 0;
  if (fx.reverb && fx.reverb.wet > 0) tail = Math.max(tail, 0.5 + fx.reverb.roomSize * 3.5 + fx.reverb.preDelay / 1000);
  if (fx.delay && fx.delay.wet > 0) tail = Math.max(tail, Math.min(4, fx.delay.time * (1 + Math.ceil(Math.log(0.05) / Math.log(Math.max(0.05, fx.delay.feedback || 0.05))))));
  return Math.min(4, tail);
}

/** A short line for a person to read: what is done to the sound. */
export function describeFx(fx: AudioFx): string {
  const parts: string[] = [];
  if (fx.denoise) parts.push(`noise reduction (${fx.denoise.focus}, ${Math.round(fx.denoise.amount * 100)} %)`);
  if (fx.highpass) parts.push(`low cut ${Math.round(fx.highpass)} Hz`);
  if (fx.lowpass) parts.push(`high cut ${Math.round(fx.lowpass)} Hz`);
  if (fx.eq) parts.push(`equaliser (${fx.eq.length} bands)`);
  if (fx.compressor) parts.push(`compressor ${fx.compressor.ratio}:1 from ${fx.compressor.threshold} dB`);
  if (fx.reverb) parts.push(`reverb (room ${fx.reverb.roomSize})`);
  if (fx.delay) parts.push(`echo ${fx.delay.time} s`);
  if (fx.gain) parts.push(`${fx.gain > 0 ? '+' : ''}${fx.gain} dB`);
  return parts.join(', ');
}

// --- reverb impulse -------------------------------------------------------------------------------

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A room as two channels of decaying noise: bigger rooms last longer (0.5 to 4 s), damping dulls the tail. Seeded, so the same room always sounds the same. */
export function impulseResponse(sampleRate: number, roomSize: number, damping: number, seed = 7): Float32Array[] {
  const duration = 0.5 + Math.min(1, Math.max(0, roomSize)) * 3.5;
  const length = Math.max(2, Math.floor(sampleRate * duration));
  return [0, 1].map(ch => {
    const rand = mulberry(seed * 31 + ch);
    const out = new Float32Array(length);
    let low = 0;
    // one-pole low pass on the noise whose cut falls as the tail goes on: damping turns it dark sooner
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const decay = Math.exp((-6.9 * t) / duration);
      const noise = rand() * 2 - 1;
      const k = Math.max(0.04, 1 - damping * (t / duration) * 0.96);
      low += k * (noise - low);
      out[i] = low * decay;
    }
    return out;
  });
}

// --- noise reduction ------------------------------------------------------------------------------

/** In-place radix-2 FFT; the length is a power of two. `inverse` divides by n. */
export function fftInPlace(re: Float32Array, im: Float32Array, inverse = false): void {
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
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
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
  if (inverse) for (let i = 0; i < n; i++) {
    re[i] = re[i]! / n;
    im[i] = im[i]! / n;
  }
}

/** Where the sound is quietest for `seconds`: the start (in seconds) of the window with the least energy, to learn the noise from. */
export function quietestWindow(data: Float32Array, rate: number, seconds: number): number {
  const win = Math.max(1, Math.floor(seconds * rate));
  if (data.length <= win) return 0;
  const step = Math.max(1, Math.floor(win / 4));
  let best = 0;
  let bestEnergy = Infinity;
  // energy of the first window, then slid along
  let energy = 0;
  for (let i = 0; i < win; i++) energy += data[i]! * data[i]!;
  for (let s = 0; s + win <= data.length; s += step) {
    if (s > 0) {
      energy = 0;
      for (let i = s; i < s + win; i += 4) energy += data[i]! * data[i]!;
      energy *= 4;
    }
    if (energy < bestEnergy) {
      bestEnergy = energy;
      best = s;
    }
  }
  return best / rate;
}

const FFT_SIZE = 2048;

/**
 * Spectral noise reduction of one channel. The noise spectrum is the average magnitude of the window `noiseFrom`..+`noiseSeconds` (or of the quietest stretch when noiseFrom is not given); each
 * frame has `over` times that taken off its magnitudes, never below `floor` of what was there, and bins are smoothed over time so the result does not warble. `amount` runs from 0 to 1.
 */
export function spectralDenoise(data: Float32Array, rate: number, options: { amount: number; floor: number; noiseFrom?: number; noiseSeconds: number }): Float32Array {
  const n = FFT_SIZE;
  const hop = n / 4;
  if (data.length < n * 2 || options.amount <= 0) return data;
  const from = options.noiseFrom ?? quietestWindow(data, rate, options.noiseSeconds);
  const start = Math.min(Math.max(0, Math.floor(from * rate)), Math.max(0, data.length - n));
  const end = Math.min(data.length, start + Math.max(n, Math.floor(options.noiseSeconds * rate)));
  const half = n / 2 + 1;
  const window = new Float32Array(n);
  for (let i = 0; i < n; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  // the noise: average magnitude per bin
  const noise = new Float32Array(half);
  let frames = 0;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let s = start; s + n <= end; s += hop) {
    for (let i = 0; i < n; i++) {
      re[i] = data[s + i]! * window[i]!;
      im[i] = 0;
    }
    fftInPlace(re, im);
    for (let k = 0; k < half; k++) noise[k] = noise[k]! + Math.hypot(re[k]!, im[k]!);
    frames++;
  }
  if (!frames) return data;
  for (let k = 0; k < half; k++) noise[k] = noise[k]! / frames;
  const over = 1 + options.amount * 2.2;
  const floor = Math.min(1, Math.max(0.02, options.floor)) * (1 - options.amount * 0.5);
  const out = new Float32Array(data.length + n);
  const norm = new Float32Array(data.length + n);
  const gainPrev = new Float32Array(half).fill(1);
  for (let s = 0; s + n <= data.length; s += hop) {
    for (let i = 0; i < n; i++) {
      re[i] = data[s + i]! * window[i]!;
      im[i] = 0;
    }
    fftInPlace(re, im);
    for (let k = 0; k < half; k++) {
      const mag = Math.hypot(re[k]!, im[k]!);
      let gain = mag > 1e-12 ? Math.max(floor, (mag - over * noise[k]!) / mag) : floor;
      gain = Math.min(1, gain);
      // smooth over time: a bin opens quickly and closes slowly
      gain = gain > gainPrev[k]! ? gain : gainPrev[k]! * 0.5 + gain * 0.5;
      gainPrev[k] = gain;
      re[k] = re[k]! * gain;
      im[k] = im[k]! * gain;
      if (k > 0 && k < n / 2) {
        re[n - k] = re[k]!;
        im[n - k] = -im[k]!;
      }
    }
    fftInPlace(re, im, true);
    for (let i = 0; i < n; i++) {
      out[s + i] = out[s + i]! + re[i]! * window[i]!;
      norm[s + i] = norm[s + i]! + window[i]! * window[i]!;
    }
  }
  const result = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) result[i] = norm[i]! > 1e-6 ? out[i]! / norm[i]! : data[i]!;
  return result;
}
