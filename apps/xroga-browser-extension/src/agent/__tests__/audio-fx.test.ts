import { describe, expect, it } from 'vitest';
import { EQ_PRESETS, NOISE_FOCUS, describeFx, fftInPlace, fxTail, impulseResponse, normalizeFx, quietestWindow, spectralDenoise } from '../audio-fx';

const rms = (d: Float32Array, a: number, b: number) => {
  let s = 0;
  for (let i = a; i < b; i++) s += d[i]! * d[i]!;
  return Math.sqrt(s / Math.max(1, b - a));
};

describe('reading fx', () => {
  it('returns nothing for nothing and clamps what it is given', () => {
    expect(normalizeFx(undefined)).toBeUndefined();
    expect(normalizeFx({})).toBeUndefined();
    expect(normalizeFx({ gain: 99, highpass: 5, lowpass: 99999 })).toEqual({ gain: 24, highpass: 20, lowpass: 20000 });
  });
  it('takes a preset name or a list of bands, and true for the defaults', () => {
    expect(normalizeFx({ eq: 'voice' })?.eq).toEqual(EQ_PRESETS.voice);
    expect(normalizeFx({ eq: [{ type: 'peaking', frequency: 1e9, gain: 50, q: 0 }, { type: 'wobble' }] })?.eq).toEqual([{ type: 'peaking', frequency: 20000, gain: 24, q: 0.1 }]);
    const fx = normalizeFx({ compressor: true, reverb: true, delay: { time: 9 }, denoise: { focus: 'hum' } })!;
    expect(fx.compressor).toMatchObject({ ratio: 4, threshold: -24 });
    expect(fx.reverb?.wet).toBe(0.25);
    expect(fx.delay?.time).toBe(2);
    expect(fx.denoise?.focus).toBe('hum');
    expect(normalizeFx({ denoise: { focus: 'nonsense' } })?.denoise?.focus).toBe('speech');
  });
  it('knows the tail it adds and says what it does', () => {
    expect(fxTail({ gain: 3 })).toBe(0);
    expect(fxTail(normalizeFx({ reverb: { roomSize: 1 } })!)).toBeGreaterThan(3.5);
    expect(describeFx(normalizeFx({ denoise: true, eq: 'warm', gain: -3 })!)).toContain('noise reduction');
    expect(Object.keys(NOISE_FOCUS)).toHaveLength(7);
  });
});

describe('the FFT', () => {
  it('finds a tone in the right bin and gets the signal back', () => {
    const n = 256;
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 8 * i) / n);
    const copy = Float32Array.from(re);
    fftInPlace(re, im);
    const mags = Array.from(re, (r, i) => Math.hypot(r, im[i]!));
    expect(mags.indexOf(Math.max(...mags.slice(0, n / 2)))).toBe(8);
    fftInPlace(re, im, true);
    expect(Math.abs(re[10]! - copy[10]!)).toBeLessThan(1e-4);
  });
});

describe('the reverb room', () => {
  it('is the same every time, lasts longer in a big room, and fades away', () => {
    const small = impulseResponse(8000, 0, 0.5);
    const big = impulseResponse(8000, 1, 0.5);
    expect(big[0]!.length).toBeGreaterThan(small[0]!.length * 4);
    expect(Array.from(impulseResponse(8000, 0.5, 0.5)[1]!.slice(0, 20))).toEqual(Array.from(impulseResponse(8000, 0.5, 0.5)[1]!.slice(0, 20)));
    expect(rms(big[0]!, 0, 1000)).toBeGreaterThan(rms(big[0]!, big[0]!.length - 1000, big[0]!.length) * 20);
    expect(Math.abs(big[0]![5]! - big[1]![5]!)).toBeGreaterThan(0);
  });
});

describe('noise reduction', () => {
  const rate = 16000;
  const make = () => {
    const d = new Float32Array(rate * 3);
    let seed = 1;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
    for (let i = 0; i < d.length; i++) d[i] = rand() * 0.05 + (i > rate * 1 ? 0.3 * Math.sin((2 * Math.PI * 440 * i) / rate) : 0);
    return d;
  };
  it('finds the quiet stretch', () => {
    expect(quietestWindow(make(), rate, 0.5)).toBeLessThan(0.6);
  });
  it('takes the hiss away and keeps the tone', () => {
    const d = make();
    const cleaned = spectralDenoise(d, rate, { amount: 0.8, floor: NOISE_FOCUS.speech.floor, noiseSeconds: 0.5 });
    const hissBefore = rms(d, 2000, 12000);
    const hissAfter = rms(cleaned, 2000, 12000);
    expect(hissAfter).toBeLessThan(hissBefore * 0.35);
    const toneBefore = rms(d, rate * 1.5, rate * 2.5);
    const toneAfter = rms(cleaned, rate * 1.5, rate * 2.5);
    expect(toneAfter).toBeGreaterThan(toneBefore * 0.8);
    expect(cleaned).toHaveLength(d.length);
  });
  it('does nothing at amount 0 or for a very short sound', () => {
    const d = make();
    expect(spectralDenoise(d, rate, { amount: 0, floor: 0.2, noiseSeconds: 0.5 })).toBe(d);
    const tiny = new Float32Array(100);
    expect(spectralDenoise(tiny, rate, { amount: 1, floor: 0.2, noiseSeconds: 0.5 })).toBe(tiny);
  });
});
