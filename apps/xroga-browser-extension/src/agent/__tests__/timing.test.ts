import { describe, expect, it } from 'vitest';
import { RunTimings, percentile } from '../timing';

function clock(start = 1000) {
  let now = start;
  return { read: () => now, advance: (ms: number) => (now += ms) };
}

describe('RunTimings', () => {
  it('records how long a phase took and counts it', async () => {
    const c = clock();
    const t = new RunTimings(c.read);
    await t.time('model', async () => c.advance(120));
    await t.time('model', async () => c.advance(80));
    expect(t.summary().phases.model).toEqual({ count: 2, totalMs: 200, maxMs: 120, p50Ms: 80 });
  });

  it('records a phase that throws, and passes the error on', async () => {
    const c = clock();
    const t = new RunTimings(c.read);
    await expect(
      t.time('tools', async () => {
        c.advance(30);
        throw new Error('page closed');
      }),
    ).rejects.toThrow('page closed');
    expect(t.summary().phases.tools.count).toBe(1);
    expect(t.summary().phases.tools.totalMs).toBe(30);
  });

  it('names a moment once, from the recorder start, and keeps the first', () => {
    const c = clock();
    const t = new RunTimings(c.read);
    c.advance(250);
    t.mark('first-model-request');
    c.advance(900);
    t.mark('first-model-request');
    expect(t.summary().marks).toEqual({ 'first-model-request': 250 });
    expect(t.summary().wallMs).toBe(1150);
  });

  it('ignores impossible durations instead of poisoning the totals', () => {
    const t = new RunTimings(() => 0);
    t.add('prepare', Number.NaN);
    t.add('prepare', -5);
    t.add('prepare', Number.POSITIVE_INFINITY);
    expect(t.summary().phases.prepare).toBeUndefined();
  });

  it('keeps a bounded number of samples per phase but counts all of them', () => {
    const t = new RunTimings(() => 0);
    for (let i = 1; i <= 500; i++) t.add('tool.layer', i);
    const phase = t.summary().phases['tool.layer'];
    expect(phase.count).toBe(500);
    expect(phase.totalMs).toBe(125250);
    expect(phase.maxMs).toBe(500);
    // The median is of the last 200 samples (301..500).
    expect(phase.p50Ms).toBe(400);
  });

  it('times one tool by name next to the stages of a call', async () => {
    const c = clock();
    const t = new RunTimings(c.read);
    await t.time('tool:click', async () => {
      await t.time('tool.gate', async () => c.advance(5));
      await t.time('tool.layer', async () => c.advance(300));
      await t.time('tool.after', async () => c.advance(20));
    });
    const { phases } = t.summary();
    expect(phases['tool:click'].totalMs).toBe(325);
    expect(phases['tool.layer'].totalMs).toBe(300);
  });
});

describe('percentile', () => {
  it('uses nearest rank', () => {
    expect(percentile([5, 1, 9, 3, 7], 0.5)).toBe(5);
    expect(percentile([5, 1, 9, 3, 7], 0.95)).toBe(9);
    expect(percentile([5, 1, 9, 3, 7], 0)).toBe(1);
  });
  it('is zero for no data', () => {
    expect(percentile([], 0.5)).toBe(0);
  });
});
