/**
 * How hard the model is asked to think on each turn of one run.
 *
 * The server decides what is allowed (`none`, `high`, `max`; it is the authority and sets output room and spend per effort); this says what the run
 * ASKS for. A run starts at `high`. It goes to `max` when the evidence says the last approach is not working: the progress tracker called a stall,
 * which means repeated or unproductive actions, i.e. prior reasoning was wrong or the page is ambiguous. After a few turns of real progress it
 * returns to `high`, so deeper (slower, dearer) reasoning is spent where it pays, not on every turn.
 * One control belongs to one run: workers have their own.
 */
export type Effort = 'none' | 'high' | 'max';

const PROGRESS_TURNS_TO_RELAX = 4;

export class EffortControl {
  #level: Effort;
  #calm = 0;
  #changes: Array<{ turn: number; level: Effort; why: string }> = [];
  #turn = 0;

  constructor(start: Effort = 'high') {
    this.#level = start;
  }

  get level(): Effort {
    return this.#level;
  }

  /** The turns at which the level changed and why: for the receipt and the evidence. */
  get changes(): ReadonlyArray<{ turn: number; level: Effort; why: string }> {
    return this.#changes;
  }

  #set(level: Effort, why: string): void {
    if (level === this.#level) return;
    this.#level = level;
    this.#changes.push({ turn: this.#turn, level, why });
  }

  /** One tool turn finished. `stalled` is the progress tracker's verdict for it. */
  noteTurn(stalled: boolean): void {
    this.#turn++;
    if (stalled) {
      this.#calm = 0;
      this.#set('max', 'the run stopped making progress');
      return;
    }
    this.#calm++;
    if (this.#level === 'max' && this.#calm >= PROGRESS_TURNS_TO_RELAX) this.#set('high', `${PROGRESS_TURNS_TO_RELAX} turns of progress`);
  }
}

/** The output room a request asks for: reasoning tokens count against it, so a thinking turn needs more than the 2,048 a non-thinking one does. The server caps it. */
export function outputRoom(effort: Effort): number {
  return effort === 'max' ? 6_144 : effort === 'high' ? 4_096 : 2_048;
}
