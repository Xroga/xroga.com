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
/** Adaptive runs: calm turns after which a `high` turn goes back to `none`. */
const CALM_TO_NONE = 2;

/**
 * What the turn just finished says about the next one. Measured (2026-11-23, live DeepSeek, 18 replica tasks): with no reasoning, routine work (forms, painted menus,
 * timelines, CRM, database) was about a quarter to a half faster with the same pass rate, but the judgement after an uncertain save failed (2 of 2 lost-acknowledgement
 * runs claimed four drafts while fewer were saved). So an adaptive run thinks only where the evidence says it must: after an error or an uncertain result, and on the
 * turn that reads back what was written.
 */
export interface TurnSignal {
  /** The call failed. */
  error?: boolean;
  /** The call worked but its result is in doubt: a save answered with a timeout or "not saved", a postcondition not met, an action with no effect. */
  uncertain?: boolean;
  /** The call reads back what earlier writes did (a reload, a read or snapshot after a write): the next turn judges whether the work is done. */
  verify?: boolean;
}

export class EffortControl {
  #level: Effort;
  #calm = 0;
  #changes: Array<{ turn: number; level: Effort; why: string }> = [];
  #turn = 0;

  readonly #adaptive: boolean;
  readonly #fixed: boolean;
  readonly #noMax: boolean;

  /** `adaptive`: start at `start` (high) for planning, drop to none after routine turns, and think again where a turn's evidence asks for it (see TurnSignal). */
  constructor(start: Effort = 'high', options: { adaptive?: boolean; fixed?: boolean; noMax?: boolean } = {}) {
    // `noMax`: a stall asks for high (already the top of what this run uses), never max.
    this.#noMax = options.noMax === true;
    // `fixed`: the level never changes (the product runs at high on every turn, by the owner's decision).
    this.#fixed = options.fixed === true;
    this.#adaptive = options.adaptive === true && !this.#fixed;
    // An adaptive run thinks first (the turns that read the task, plan and compute), then drops to none after two routine turns.
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
  noteTurn(stalled: boolean, signal: TurnSignal = {}): void {
    this.#turn++;
    if (this.#fixed) return;
    if (stalled) {
      this.#calm = 0;
      this.#set(this.#noMax ? 'high' : 'max', 'the run stopped making progress');
      return;
    }
    if (this.#adaptive && (signal.error || signal.uncertain || signal.verify)) {
      this.#calm = 0;
      if (this.#level === 'none') this.#set('high', signal.error ? 'a call failed' : signal.uncertain ? 'a result is in doubt' : 'checking written work');
      return;
    }
    this.#calm++;
    if (this.#level === 'max' && this.#calm >= PROGRESS_TURNS_TO_RELAX) this.#set('high', `${PROGRESS_TURNS_TO_RELAX} turns of progress`);
    else if (this.#adaptive && this.#level === 'high' && this.#calm >= CALM_TO_NONE) this.#set('none', `${CALM_TO_NONE} routine turns`);
  }
}

/** The output room a request asks for: reasoning tokens count against it, so a thinking turn needs more than the 2,048 a non-thinking one does. The server caps it. */
export function outputRoom(effort: Effort): number {
  return effort === 'max' ? 96_000 : effort === 'high' ? 64_000 : 4_096;
}
