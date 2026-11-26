import { describe, expect, it } from 'vitest';
import { spendLine, spendOf } from '../spend';

const u = (input: number, cacheRead: number, output: number, reasoning = 0) => ({ input, cacheRead, cacheWrite: 0, output, reasoning });

describe('spend', () => {
  it('adds the run and its workers and reports the cached share', () => {
    const s = spendOf({ turns: 20, usage: u(1000, 900, 100, 60) }, [{ turns: 5, usage: u(500, 100, 40) }, { turns: 7, usage: u(500, 0, 60) }]);
    expect(s).toMatchObject({ turns: 20, workerTurns: 12, workers: 2, input: 2000, cached: 1000, output: 200, reasoning: 60, cachedPercent: 50 });
    expect(spendLine(s)).toBe('20 model turns + 2 workers, 12 turns · 2,000 input tokens (50% cached) · 200 output');
  });
  it('is zero-safe', () => {
    expect(spendOf({ turns: 0, usage: u(0, 0, 0) }, []).cachedPercent).toBe(0);
  });
});
