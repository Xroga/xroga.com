/** Code-owned progress fingerprints and strategy switching.
 * A run is "stalled" when the same call lands on the same observed state, or the same tool keeps failing, a small bounded number of times.
 * Then the code (not a prompt reminder at turn 20/35/50) moves the run down the strategy ladder and, when the ladder is spent, stops with a blocker.
 * In-memory run state only.
 */
import { diagnose, directiveFor, isTerminal } from './failure-diagnosis';

export type Strategy = 'CONNECTED_TOOL' | 'DOM_A11Y' | 'DOM_BATCH' | 'VISUAL_GUI' | 'APP_NATIVE' | 'RECOVERY';
export const STRATEGY_LADDER: readonly Strategy[] = ['DOM_A11Y', 'DOM_BATCH', 'VISUAL_GUI', 'APP_NATIVE', 'RECOVERY'];

export interface ProgressObservation {
  tool: string;
  /** The layer's error code for a failed call, when it gave one. */
  errorCode?: string;
  action?: string;
  /** Normalised call arguments (hashed, not stored). */
  args?: unknown;
  isError: boolean;
  /** Result text and page identity after the call. */
  resultText?: string;
  tabId?: number | null;
  url?: string;
}

export interface StallVerdict {
  stalled: boolean;
  reason?: string;
  strategy: Strategy;
  switched: boolean;
  exhausted: boolean;
  directive?: string;
  /** Why the last failure happened, from the layer's code, and what to do next. */
  diagnosis?: string;
}

const REPEAT_LIMIT = 3; // identical call on identical state
const FAILURE_LIMIT = 3; // same tool/action failing in a row

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + ':' + s.length;
}

export function fingerprint(o: ProgressObservation): { call: string; state: string } {
  const call = hash(JSON.stringify([o.tool, o.action ?? '', o.args ?? null, o.tabId ?? null]));
  const state = hash(JSON.stringify([o.tabId ?? null, o.url ?? '', (o.resultText ?? '').slice(0, 2000), o.isError]));
  return { call, state };
}

const DIRECTIVES: Record<Strategy, string> = {
  CONNECTED_TOOL: 'Strategy changed to CONNECTED_TOOL: use the authorized connected tool or API for this work instead of the page.',
  DOM_A11Y: 'Strategy changed to DOM_A11Y: take a fresh snapshot and use the named controls in it.',
  DOM_BATCH: 'Strategy changed to DOM_BATCH: stop single clicks. Group the remaining steps into one batch call with preconditions.',
  VISUAL_GUI: 'Strategy changed to VISUAL_GUI: take a fresh screenshot of the bound tab and act on what it shows, not on remembered coordinates or earlier element ids.',
  APP_NATIVE: 'Strategy changed to APP_NATIVE: use the app script console, command palette or keyboard commands instead of menus, and read its Output to verify.',
  RECOVERY: 'Strategy changed to RECOVERY: inspect the current document and tabs, undo or remove any duplicate or partial work, then continue from the verified state or finish with the exact blocker.',
};

export class ProgressTracker {
  #strategyIndex = 0;
  #order: readonly Strategy[] = STRATEGY_LADDER;
  #lastCall = '';
  #lastState = '';
  #repeat = 0;
  #failures = 0;
  #failureKey = '';
  #switches = 0;

  get strategy(): Strategy { return this.#order[this.#strategyIndex]!; }
  get order(): readonly Strategy[] { return this.#order; }

  /** Starts a new order chosen from evidence about the page. Only before any method has stalled: a switch already made is never undone. */
  reorder(order: readonly Strategy[]): boolean {
    if (this.#switches > 0 || order.length === 0 || order[order.length - 1] !== 'RECOVERY') return false;
    this.#order = order;
    this.#strategyIndex = 0;
    return true;
  }
  get switches(): number { return this.#switches; }

  record(o: ProgressObservation): StallVerdict {
    const f = fingerprint(o);
    if (f.call === this.#lastCall && f.state === this.#lastState) this.#repeat++;
    else this.#repeat = 1;
    this.#lastCall = f.call;
    this.#lastState = f.state;
    const key = `${o.tool}:${o.action ?? ''}`;
    if (o.isError) {
      const d = diagnose(o.errorCode, o.resultText ?? '');
      if (isTerminal(d)) {
        // Only a person can decide this. The run is NOT stopped (a handover or an approval may be about to resolve it and the model may have another route):
        // the model is told once, at once, not to retry the same call and to ask the user or report the exact blocker.
        return { stalled: true, reason: `${key} needs a decision outside the run (${o.errorCode ?? d})`, strategy: this.strategy, switched: false, exhausted: false, diagnosis: d, directive: `${directiveFor(d)} Do not repeat this call.` };
      }
    }
    if (o.isError) {
      this.#failures = key === this.#failureKey ? this.#failures + 1 : 1;
      this.#failureKey = key;
    } else {
      this.#failures = 0;
      this.#failureKey = '';
    }
    const lastDiagnosis = o.isError ? diagnose(o.errorCode, o.resultText ?? '') : undefined;
    let reason: string | undefined;
    if (this.#repeat >= REPEAT_LIMIT) reason = `the same ${key} call produced the same page state ${this.#repeat} times`;
    else if (this.#failures >= FAILURE_LIMIT) reason = `${key} failed ${this.#failures} times in a row`;
    if (!reason) return { stalled: false, strategy: this.strategy, switched: false, exhausted: false };
    this.#repeat = 0;
    this.#failures = 0;
    this.#failureKey = '';
    this.#lastCall = '';
    if (this.#strategyIndex >= this.#order.length - 1) {
      return { stalled: true, reason, strategy: this.strategy, switched: false, exhausted: true, directive: `No strategy is left (${reason}). Finish now with the exact blocker and what is already done; do not retry.` };
    }
    this.#strategyIndex++;
    this.#switches++;
    return { stalled: true, reason, strategy: this.strategy, switched: true, exhausted: false, directive: `Stalled: ${reason}. ${DIRECTIVES[this.strategy]}${lastDiagnosis ? ' ' + directiveFor(lastDiagnosis) : ''}`, ...(lastDiagnosis ? { diagnosis: lastDiagnosis } : {}) };
  }
}
