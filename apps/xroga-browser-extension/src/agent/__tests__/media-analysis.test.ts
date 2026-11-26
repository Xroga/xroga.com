import { describe, expect, it } from 'vitest';
import { clock, computeEnvelope, decimate, describeAudio, describeBeats, describeScenes, detectCuts, detectSilences, frameDifference, integratedLoudness, samplePeakDb, toMono, trackBeats, waveformLine } from '../media-analysis';

const sine = (hz: number, seconds: number, rate: number, amp = 1) => Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate));

describe('silence and level', () => {
  it('finds the quiet stretches that are long enough, and their edges', () => {
    const rate = 8000;
    const tone = sine(440, 1, rate, 0.5);
    const quiet = new Float32Array(rate * 1.5);
    const short = new Float32Array(Math.round(rate * 0.2));
    const all = Float32Array.from([...tone, ...quiet, ...tone, ...short, ...tone]);
    const found = detectSilences(computeEnvelope(all, rate, 0.05), { thresholdDb: -40, minSeconds: 0.5 });
    expect(found).toHaveLength(1);
    expect(found[0]!.start).toBeCloseTo(1, 1);
    expect(found[0]!.end).toBeCloseTo(2.5, 1);
  });

  it('draws the level over time and keeps quiet low and loud high', () => {
    const rate = 8000;
    const line = waveformLine(computeEnvelope(Float32Array.from([...sine(300, 1, rate, 0.01), ...sine(300, 1, rate, 0.9)]), rate), 10);
    expect(line).toHaveLength(10);
    expect(line.slice(0, 4)).toMatch(/^[▁▂▃]+$/);
    expect(line.slice(-4)).toMatch(/^[▇█]+$/);
    expect(waveformLine({ windowSec: 0.05, rms: [], peak: [] })).toBe('');
  });

  it('measures peak and averages channels', () => {
    expect(samplePeakDb([Float32Array.from([0.5, -0.25])])).toBe(-6);
    expect(Array.from(toMono([Float32Array.from([1, 0]), Float32Array.from([0, 1])]))).toEqual([0.5, 0.5]);
    expect(Array.from(decimate(Float32Array.from([1, 3, 5, 7]), 2))).toEqual([2, 6]);
  });
});

describe('loudness (BS.1770)', () => {
  it('reads a full-scale 997 Hz tone as about -3 LUFS, and 10 dB lower as 10 LU lower', () => {
    for (const rate of [44100, 48000]) {
      const loud = integratedLoudness([sine(997, 5, rate, 1)], rate)!;
      const quiet = integratedLoudness([sine(997, 5, rate, 10 ** (-10 / 20))], rate)!;
      expect(loud).toBeGreaterThan(-3.3);
      expect(loud).toBeLessThan(-2.7);
      expect(loud - quiet).toBeGreaterThan(9.8);
      expect(loud - quiet).toBeLessThan(10.2);
    }
  });

  it('adds channels and ignores silence', () => {
    const one = integratedLoudness([sine(997, 4, 48000)], 48000)!;
    const two = integratedLoudness([sine(997, 4, 48000), sine(997, 4, 48000)], 48000)!;
    expect(two - one).toBeGreaterThan(2.9);
    expect(two - one).toBeLessThan(3.1);
    expect(integratedLoudness([new Float32Array(48000 * 2)], 48000)).toBeNull();
    expect(integratedLoudness([new Float32Array(100)], 48000)).toBeNull();
  });
});

describe('beats', () => {
  it('finds the tempo and the beat times of a click track', () => {
    const rate = 11025;
    const bpm = 120;
    const seconds = 24;
    const pcm = new Float32Array(rate * seconds);
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
    for (let b = 0; b * (60 / bpm) < seconds - 0.1; b++) {
      const start = Math.round(b * (60 / bpm) * rate);
      for (let i = 0; i < 400; i++) pcm[start + i] = rnd() * Math.exp(-i / 90);
    }
    const out = trackBeats(pcm, rate);
    expect(out.bpm).toBeGreaterThan(118);
    expect(out.bpm).toBeLessThan(122);
    expect(out.beats.length).toBeGreaterThan(40);
    const gaps = out.beats.slice(1).map((t, i) => t - out.beats[i]!);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(0.1);
    expect(out.confidence).toBeGreaterThan(0.5);
  });

  it('says there is no beat in a plain tone, and in something too short', () => {
    expect(trackBeats(sine(220, 20, 11025, 0.5), 11025)).toEqual({ bpm: 0, confidence: 0, beats: [] });
    expect(trackBeats(new Float32Array(2000), 11025)).toEqual({ bpm: 0, confidence: 0, beats: [] });
  });
});

describe('cuts', () => {
  it('finds a jump between frames, not a slow change, and keeps cuts apart', () => {
    const times = Array.from({ length: 20 }, (_, i) => i * 0.5);
    const diffs = times.map(() => 0.01);
    diffs[7] = 0.5;
    diffs[8] = 0.45;
    diffs[14] = 0.3;
    expect(detectCuts(times, diffs)).toEqual([3.5, 7]);
    const ramp = times.map((_, i) => 0.02 + i * 0.004);
    expect(detectCuts(times, ramp)).toEqual([]);
    expect(frameDifference(Uint8Array.from([0, 0]), Uint8Array.from([255, 0]))).toBeCloseTo(0.5);
  });
});

describe('text', () => {
  it('writes times and reports', () => {
    expect(clock(75.4)).toBe('1:15.4');
    expect(clock(5)).toBe('0:05');
    const text = describeAudio({ seconds: 70, sampleRate: 48000, channels: 2, loudnessLufs: -16.2, peakDb: -1.1, rmsDb: -20, silences: [{ start: 10, end: 12.5 }], line: '▁▂█' }, { thresholdDb: -40, minSeconds: 0.5 });
    expect(text).toContain('integrated loudness -16.2 LUFS');
    expect(text).toContain('1 silence of 0.5 s or more below -40 dB (2.5 s in all): 0:10–0:12.5');
    expect(describeAudio({ seconds: 5, sampleRate: 8000, channels: 1, loudnessLufs: null, peakDb: -90, rmsDb: -95, silences: [], line: '' }, { thresholdDb: -40, minSeconds: 1 })).toContain('too quiet to measure');
    expect(describeBeats({ bpm: 0, confidence: 0, beats: [] }, 20)).toContain('No steady beat');
    expect(describeBeats({ bpm: 120, confidence: 0.9, beats: [0.5, 1, 1.5] }, 2)).toContain('Tempo about 120 BPM');
    expect(describeScenes([3.5, 7], 10, 20)).toContain('2 cuts');
    expect(describeScenes([], 10, 20)).toContain('No cut found');
  });
});

describe('bars', () => {
  it('finds the beat that starts each bar from the accent in a click track', () => {
    const rate = 11025;
    const seconds = 32;
    const pcm = new Float32Array(rate * seconds);
    let seed = 11;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
    for (let b = 0; b * 0.5 < seconds - 0.2; b++) {
      const start = Math.round(b * 0.5 * rate);
      const level = b % 4 === 1 ? 1 : 0.35; // the accent falls on beat 1, 5, 9 … of the clicks
      for (let i = 0; i < 400; i++) pcm[start + i] = level * rnd() * Math.exp(-i / 90);
    }
    const out = trackBeats(pcm, rate);
    expect(out.downbeats?.length).toBeGreaterThan(5);
    // every bar start is an accented click: 0.5 s after a multiple of 2 s
    for (const t of out.downbeats!) expect(((t - 0.5) / 2) % 1 < 0.05 || ((t - 0.5) / 2) % 1 > 0.95).toBe(true);
    expect(describeBeats(out, seconds)).toContain('Bars (4/4) probably start at');
  });
});
