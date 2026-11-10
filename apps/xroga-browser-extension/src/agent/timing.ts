// Where a run's time goes. A recorder the loop and the run manager feed, read back as a summary when the run ends.
// It measures; it never changes what the run does. The summaries stay on this device (a bounded ring in extension
// storage), carry only phase names, counts and milliseconds, and are never sent to a server or shown to the page.

/** The phases of one turn, in order, and the stages of one tool call. */
export type Phase =
  | 'prepare' // storing the header, building the request, compacting if needed
  | 'model' // from the request leaving to the reply being complete
  | 'tools' // the whole batch of calls the reply asked for
  | 'finish' // recording the turn's outcome and deciding whether the run ends
  | 'tool.gate' // the permission and write-approval decision before a call
  | 'tool.journal' // the intent record on disk before anything is dispatched
  | 'tool.layer' // the browser action itself, including its settle and observation
  | 'tool.after' // recording the result and the verification that follows
  | `tool:${string}`; // one tool's total, by name

export interface PhaseSummary {
  count: number;
  totalMs: number;
  maxMs: number;
  /** Median of the recorded samples (the last 200 per phase). */
  p50Ms: number;
}

export interface TimingSummary {
  /** Milliseconds from the recorder's creation to the summary. */
  wallMs: number;
  /** Milliseconds from the recorder's creation to each named mark, in the order they were set. */
  marks: Record<string, number>;
  phases: Record<string, PhaseSummary>;
}

const SAMPLE_LIMIT = 200;

export class RunTimings {
  readonly #started: number;
  readonly #marks = new Map<string, number>();
  readonly #phases = new Map<string, { count: number; totalMs: number; maxMs: number; samples: number[] }>();

  constructor(private readonly now: () => number = () => performance.now()) {
    this.#started = this.now();
  }

  /** Names a moment (first mark wins), such as the run's first model request. */
  mark(name: string): void {
    if (!this.#marks.has(name)) this.#marks.set(name, this.now() - this.#started);
  }

  add(phase: Phase, ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    const stat = this.#phases.get(phase) ?? { count: 0, totalMs: 0, maxMs: 0, samples: [] };
    stat.count += 1;
    stat.totalMs += ms;
    stat.maxMs = Math.max(stat.maxMs, ms);
    stat.samples.push(ms);
    if (stat.samples.length > SAMPLE_LIMIT) stat.samples.shift();
    this.#phases.set(phase, stat);
  }

  /** Runs `work`, records how long it took even if it throws, and returns its result. */
  async time<T>(phase: Phase, work: () => Promise<T>): Promise<T> {
    const start = this.now();
    try {
      return await work();
    } finally {
      this.add(phase, this.now() - start);
    }
  }

  summary(): TimingSummary {
    const phases: Record<string, PhaseSummary> = {};
    for (const [name, stat] of this.#phases) {
      const sorted = [...stat.samples].sort((a, b) => a - b);
      phases[name] = {
        count: stat.count,
        totalMs: Math.round(stat.totalMs),
        maxMs: Math.round(stat.maxMs),
        p50Ms: Math.round(sorted[Math.floor((sorted.length - 1) / 2)] ?? 0),
      };
    }
    return {
      wallMs: Math.round(this.now() - this.#started),
      marks: Object.fromEntries([...this.#marks].map(([name, ms]) => [name, Math.round(ms)])),
      phases,
    };
  }
}

/** The p-th percentile (0..1) of a list of numbers, by nearest rank; 0 for an empty list. */
export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}
