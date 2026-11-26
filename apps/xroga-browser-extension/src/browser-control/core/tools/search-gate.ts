// Keeps web_search polite, the way a person using the browser is: the same question is not asked twice, the same engine is not hit in a burst, and an engine that has just
// asked for a human check is left alone for a while while another one is used. Fewer requests means fewer checks. Nothing here hides the automation or answers a check.
export const CACHE_MS = 15 * 60_000;
export const COOLDOWN_MS = 30 * 60_000;
export const SPACING_MS = 2_500;
const CACHE_MAX = 200;

export type Hits<T> = { hits: T[]; blocked?: string };

export class SearchGate<T> {
  #cache = new Map<string, { at: number; value: Hits<T> }>();
  #cool = new Map<string, number>();
  #last = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  /** A good answer to the same question from the same engine, if one was read lately. */
  cached(engine: string, query: string): Hits<T> | undefined {
    const hit = this.#cache.get(`${engine} ${query.toLowerCase()}`);
    return hit && this.now() - hit.at < CACHE_MS ? hit.value : undefined;
  }

  /** Remembers a read: results are kept, a check puts the engine to rest. */
  record(engine: string, query: string, value: Hits<T>): void {
    if (value.blocked) {
      this.#cool.set(engine, this.now());
      return;
    }
    if (!value.hits.length) return;
    if (this.#cache.size >= CACHE_MAX) this.#cache.delete(this.#cache.keys().next().value as string);
    this.#cache.set(`${engine} ${query.toLowerCase()}`, { at: this.now(), value });
  }

  resting(engine: string): boolean {
    const at = this.#cool.get(engine);
    return at !== undefined && this.now() - at < COOLDOWN_MS;
  }

  /** The engine to use: the one asked for unless it is resting, then the next one that is not; null when all are resting. */
  pick(asked: string, all: readonly string[]): string | null {
    if (!this.resting(asked)) return asked;
    return all.find(e => e !== asked && !this.resting(e)) ?? null;
  }

  /** Milliseconds to wait before this engine is asked again, and the moment is reserved. */
  wait(engine: string): number {
    const t = this.now();
    const next = Math.max(t, (this.#last.get(engine) ?? 0) + SPACING_MS);
    this.#last.set(engine, next);
    return next - t;
  }
}
