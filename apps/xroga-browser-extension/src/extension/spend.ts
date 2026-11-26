// What a run spent, counted from what the provider reported: model turns, tokens in and out, and how much input came from the cache, for the run itself and for the
// parallel workers it started. Local only; no page text. It exists so waste (calls that did not pay off, a cache that is not being hit) is measured, not guessed.
import type { Usage } from '@src/store/types';

export interface Spend {
  turns: number;
  workerTurns: number;
  workers: number;
  input: number;
  cached: number;
  output: number;
  reasoning: number;
  /** Share of input tokens served from the cache, 0 to 100. */
  cachedPercent: number;
}

const sum = (list: Usage[]) =>
  list.reduce(
    (a, u) => ({ input: a.input + u.input, cached: a.cached + u.cacheRead, output: a.output + u.output, reasoning: a.reasoning + (u.reasoning ?? 0) }),
    { input: 0, cached: 0, output: 0, reasoning: 0 },
  );

/** `own` is the run itself; `workers` are the runs of the workers it started. */
export function spendOf(own: { turns: number; usage: Usage }, workers: Array<{ turns: number; usage: Usage }>): Spend {
  const t = sum([own.usage, ...workers.map(w => w.usage)]);
  return {
    turns: own.turns,
    workerTurns: workers.reduce((n, w) => n + w.turns, 0),
    workers: workers.length,
    ...t,
    cachedPercent: t.input ? Math.round((100 * t.cached) / t.input) : 0,
  };
}

export function spendLine(s: Spend): string {
  const workers = s.workers ? ` + ${s.workers} workers, ${s.workerTurns} turns` : '';
  return `${s.turns} model turns${workers} · ${s.input.toLocaleString('en-US')} input tokens (${s.cachedPercent}% cached) · ${s.output.toLocaleString('en-US')} output`;
}
