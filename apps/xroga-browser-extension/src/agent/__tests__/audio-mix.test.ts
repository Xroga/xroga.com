import { describe, expect, it } from 'vitest';
import { FADE_CURVES, applyGainSoftLimit, crossfadeGains, fadeCurve, normalizationGain, timeStretch } from '../audio-mix';
import { integratedLoudness } from '../media-analysis';

const sine = (hz: number, seconds: number, rate: number, amp = 0.5) => Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate));
/** Frequency from the rising zero crossings. */
function frequency(x: Float32Array, rate: number): number {
  let crossings = 0;
  for (let i = 1; i < x.length; i++) if (x[i - 1]! < 0 && x[i]! >= 0) crossings++;
  return crossings / (x.length / rate);
}

describe('fade curves', () => {
  it('start at 0 and end at 1, and rise, for every curve but none', () => {
    for (const name of FADE_CURVES.filter(n => n !== 'nofade')) {
      expect(fadeCurve(name, 0), name).toBeCloseTo(0, 5);
      expect(fadeCurve(name, 1), name).toBeCloseTo(1, 5);
      let last = -1;
      for (let i = 0; i <= 20; i++) {
        const v = fadeCurve(name, i / 20);
        expect(v, name).toBeGreaterThanOrEqual(last - 1e-9);
        last = v;
      }
    }
    expect(fadeCurve('nofade', 0.3)).toBe(1);
    expect(fadeCurve('tri', 0.25)).toBe(0.25);
    expect(fadeCurve('qua', 0.5)).toBe(0.25);
    expect(fadeCurve('unknown', 0.4)).toBe(0.4);
  });

  it('cross-fades: the outgoing sound goes from 1 to 0 and the incoming from 0 to 1', () => {
    const g = crossfadeGains('tri', 'tri', 5);
    expect(Array.from(g.out)).toEqual([1, 0.75, 0.5, 0.25, 0]);
    expect(Array.from(g.in)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    const s = crossfadeGains('qsin', 'qsin', 101);
    // the power of the two together stays level with a sine pair: out² + in² is 1
    expect(s.out[50]! ** 2 + s.in[50]! ** 2).toBeCloseTo(1, 5);
  });
});

describe('time stretch', () => {
  it('keeps the pitch while changing the length, faster and slower', () => {
    const rate = 22050;
    const tone = sine(440, 2, rate);
    for (const factor of [2, 0.5, 1.5]) {
      const [out] = timeStretch([tone], factor, rate);
      expect(out!.length).toBe(Math.floor(tone.length / factor));
      expect(frequency(out!, rate), `rate ${factor}`).toBeGreaterThan(425);
      expect(frequency(out!, rate), `rate ${factor}`).toBeLessThan(455);
    }
  });

  it('keeps the loudness and the channels in phase, and leaves a plain speed alone', () => {
    const rate = 22050;
    const left = sine(300, 1.5, rate);
    const right = sine(300, 1.5, rate).map(x => -x); // opposite phase
    const [l, r] = timeStretch([left, right], 1.5, rate);
    let sum = 0;
    for (let i = 4000; i < l!.length - 4000; i++) sum += Math.abs(l![i]! + r![i]!);
    expect(sum / (l!.length - 8000)).toBeLessThan(1e-4); // still exactly opposite
    const rms = Math.sqrt(l!.reduce((s, x) => s + x * x, 0) / l!.length);
    expect(rms).toBeGreaterThan(0.3);
    expect(rms).toBeLessThan(0.4);
    const same = timeStretch([left], 1, rate)[0]!;
    expect(same).toEqual(left);
    expect(timeStretch([], 2, rate)).toEqual([]);
  });
});

describe('loudness normalisation', () => {
  it('finds the gain that reaches the target, within the limit, and stays below full scale', () => {
    const rate = 48000;
    const quiet = [sine(997, 5, rate, 0.05)];
    const gain = normalizationGain(quiet, rate, -16, 30)!;
    const copy = quiet.map(c => c.slice());
    applyGainSoftLimit(copy, gain);
    expect(integratedLoudness(copy, rate)!).toBeGreaterThan(-16.5);
    expect(integratedLoudness(copy, rate)!).toBeLessThan(-15.5);
    // a cap on the gain
    const capped = normalizationGain(quiet, rate, -16, 6)!;
    expect(20 * Math.log10(capped)).toBeCloseTo(6, 3);
    // nothing to measure
    expect(normalizationGain([new Float32Array(48000)], rate)).toBeNull();
    // the soft limit
    const hot = [Float32Array.from([0.5, 2, -3, 0.1])];
    applyGainSoftLimit(hot, 1);
    expect(Math.max(...hot[0]!.map(Math.abs))).toBeLessThanOrEqual(0.98 + 1e-6);
    expect(hot[0]![0]).toBeCloseTo(0.5, 5);
    expect(hot[0]![3]).toBeCloseTo(0.1, 5);
  });
});
