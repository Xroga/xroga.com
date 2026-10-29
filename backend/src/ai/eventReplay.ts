/**
 * Replay of a run's persisted events to a reconnecting client.
 *
 * A run keeps only its most recent events (see MAX_EVENTS_PER_RUN in runStore). A client that reconnects with a cursor older than the oldest retained
 * event used to receive the newer events with nothing saying that earlier ones were gone, so it looked like an unbroken history. This reports the gap
 * explicitly instead, so the UI can say "earlier progress is no longer available" rather than pretend continuity. It never invents or reorders events.
 */
export interface ReplayableEvent { readonly sequence: number }
export interface ReplayableRun<E extends ReplayableEvent> { readonly events: readonly E[]; readonly lastSequence: number }

export interface ReplayResult<E extends ReplayableEvent> {
  /** Events strictly after the cursor, in ascending sequence order, with duplicates removed. */
  readonly events: readonly E[];
  readonly lastSequence: number;
  /** Sequence of the oldest event still retained, or null when none is retained. */
  readonly firstRetainedSequence: number | null;
  /** True when events between the cursor and the oldest retained event existed but are no longer available. */
  readonly truncated: boolean;
}

export function normalizeCursor(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function replayRunEvents<E extends ReplayableEvent>(run: ReplayableRun<E>, afterSequence: number): ReplayResult<E> {
  const cursor = normalizeCursor(afterSequence);
  // Persisted history can arrive from more than one instance; order by sequence and keep the first copy of each, never an invented one.
  const seen = new Set<number>();
  const ordered = [...run.events].sort((a, b) => a.sequence - b.sequence).filter((e) => (seen.has(e.sequence) ? false : (seen.add(e.sequence), true)));
  const first = ordered.length ? ordered[0]!.sequence : null;
  const events = ordered.filter((e) => e.sequence > cursor);
  // The next event the client expects is cursor + 1. If events exist beyond the cursor but the oldest retained one is later, the ones in
  // between are gone. A client already caught up (cursor at or past the last sequence) has lost nothing.
  const truncated = cursor < run.lastSequence && first !== null && first > cursor + 1;
  return { events, lastSequence: run.lastSequence, firstRetainedSequence: first, truncated };
}

/** Client-side merge of batches that may overlap or arrive out of order: ascending, one copy per sequence. */
export function mergeEventBatches<E extends ReplayableEvent>(existing: readonly E[], incoming: readonly E[]): E[] {
  const bySequence = new Map<number, E>();
  for (const e of existing) bySequence.set(e.sequence, e);
  for (const e of incoming) if (!bySequence.has(e.sequence)) bySequence.set(e.sequence, e);
  return [...bySequence.values()].sort((a, b) => a.sequence - b.sequence);
}
