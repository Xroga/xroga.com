/** A per-run ledger of what was tried and what it did, and the evidence-based stall diagnosis built from it.
 *
 * There is no fixed ladder of strategies and no order the model must follow. The ledger records, for each KIND of method the run has used (reading the page's
 * controls, pointing at what the screenshot shows, the keyboard, a batch, the application's own commands, a connected tool, navigation, workers), how often it
 * was used, how often it failed or changed nothing, and on which targets. When actions stop making progress the model is shown that evidence, the likely cause
 * the layer's own error codes point to, and which kinds of method are available to it and not yet tried. The choice stays the model's. Nothing here ends a run.
 * In-memory run state only.
 */
import { diagnose, directiveFor, isTerminal, type Diagnosis } from './failure-diagnosis';

export type MethodClass = 'dom' | 'visual' | 'keyboard' | 'batch' | 'native' | 'connected' | 'navigate' | 'workers' | 'read' | 'skill' | 'other';

/** Kinds of method a model can act with; reading and skill lookup are not attempts at the task. */
const ACTING: ReadonlySet<MethodClass> = new Set(['dom', 'visual', 'keyboard', 'batch', 'native', 'connected', 'navigate', 'workers']);

const TOOL_CLASS: Record<string, MethodClass> = {
  click: 'dom', type: 'dom', set: 'dom', fill_form: 'dom', hover: 'dom', drag: 'dom', scroll: 'dom', upload: 'dom', handle_dialog: 'dom',
  canvas: 'visual', find_color: 'visual',
  press: 'keyboard',
  batch: 'batch',
  run_script_console: 'native', menu_path: 'native', site_action: 'native',
  plugin_read: 'connected', plugin_act: 'connected', plugin_chain: 'connected', http_get: 'connected',
  navigate: 'navigate', tabs: 'navigate',
  delegate: 'workers', start_parallel_tasks: 'workers',
  diagnostics: 'read', snapshot: 'read', read: 'read', find: 'read', screenshot: 'read', wait: 'read', read_attachment: 'read', confirm_download: 'read',
  find_skill: 'skill', read_skill: 'skill', plugin_search: 'skill', plugin_action_search: 'skill',
};

/** The kind of method a call is. A click given a point on the screenshot is pointing at pixels, not at a control. */
export function methodOf(tool: string, args?: unknown): MethodClass {
  if (tool === 'click' || tool === 'drag' || tool === 'hover') {
    const t = (args as { target?: { x?: unknown } } | undefined)?.target;
    if (t && typeof t === 'object' && 'x' in t) return 'visual';
  }
  return TOOL_CLASS[tool] ?? 'other';
}

export interface ProgressObservation {
  tool: string;
  /** The layer's error code for a failed call, when it gave one. */
  errorCode?: string;
  action?: string;
  /** Normalised call arguments (hashed, not stored). */
  args?: unknown;
  isError: boolean;
  /** What the layer saw the action do: the page changed, nothing changed, or it cannot tell (a canvas paints its own result). */
  effect?: 'changed' | 'none' | 'unknown';
  /** Result text and page identity after the call. */
  resultText?: string;
  tabId?: number | null;
  url?: string;
}

export interface StallVerdict {
  stalled: boolean;
  reason?: string;
  /** Kept for the loop's contract: nothing in the tracker ends a run. */
  exhausted: boolean;
  directive?: string;
  /** Why the last failure happened, from the layer's code. */
  diagnosis?: Diagnosis;
}

const REPEAT_LIMIT = 3; // identical call on identical state
const FAILURE_LIMIT = 3; // same tool/action failing in a row
const UNPRODUCTIVE_LIMIT = 4; // acting calls in a row that each failed or changed nothing

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

interface Entry { attempts: number; failed: number; unchanged: number; lastCode?: string }

const KIND_WORDS: Record<MethodClass, string> = {
  dom: 'acting on the page\'s controls by name or reference', visual: 'pointing at what the screenshot shows', keyboard: 'keyboard input and shortcuts',
  batch: 'a batch of steps', native: 'the application\'s own commands or a verified action', connected: 'a connected tool or API', navigate: 'navigation or another tab',
  workers: 'workers', read: 'reading', skill: 'skills', other: 'other tools',
};

const CAUSE: Partial<Record<Diagnosis, string>> = {
  stale_reference: 'the page changed under the references you hold',
  element_not_found: 'the target is not where you looked (another frame, tab, scroll position or not loaded yet)',
  ambiguous_target: 'the description matches several controls',
  occluded_or_blocked: 'something covers the control (an overlay, a dialog), or it is outside the view',
  value_not_applied: 'the control did not take the input (disabled, read-only, or it needs another step first)',
  timeout_flaky: 'the page or network is slow or unstable',
  navigation_problem: 'the destination did not load as expected',
  policy_blocked: 'the action is outside what this session may do',
  invalid_call: 'the call itself was malformed',
};

export class ProgressTracker {
  #lastCall = '';
  #lastState = '';
  #repeat = 0;
  #failures = 0;
  #failureKey = '';
  #unproductive = 0;
  #stalls = 0;
  /** Stalls called since an acting call last changed something: diagnosed dead ends in a row. */
  #stallsSinceProgress = 0;
  readonly #ledger = new Map<MethodClass, Entry>();
  #available = new Set<MethodClass>();

  /** The tools the run can use now: which kinds of method exist for it. */
  setAvailable(toolNames: Iterable<string>): void {
    this.#available = new Set([...toolNames].map(n => methodOf(n)).filter(c => ACTING.has(c)));
  }

  get stalls(): number { return this.#stalls; }
  get stallsSinceProgress(): number { return this.#stallsSinceProgress; }
  /** What has been tried: kind, attempts, failures, calls that changed nothing. */
  get ledger(): ReadonlyMap<MethodClass, Readonly<Entry>> { return this.#ledger; }

  record(o: ProgressObservation): StallVerdict {
    const cls = methodOf(o.tool, o.args);
    const acting = ACTING.has(cls);
    if (acting) {
      const e = this.#ledger.get(cls) ?? { attempts: 0, failed: 0, unchanged: 0 };
      e.attempts++;
      if (o.isError) { e.failed++; e.lastCode = o.errorCode; }
      else if (o.effect === 'none') e.unchanged++;
      this.#ledger.set(cls, e);
    }
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
        return { stalled: true, reason: `${key} needs a decision outside the run (${o.errorCode ?? d})`, exhausted: false, diagnosis: d, directive: `${directiveFor(d)} Do not repeat this call.` };
      }
      this.#failures = key === this.#failureKey ? this.#failures + 1 : 1;
      this.#failureKey = key;
    } else {
      this.#failures = 0;
      this.#failureKey = '';
    }
    if (acting) this.#unproductive = o.isError || o.effect === 'none' ? this.#unproductive + 1 : 0;
    if (acting && !o.isError && o.effect === 'changed') this.#stallsSinceProgress = 0;
    const lastDiagnosis = o.isError ? diagnose(o.errorCode, o.resultText ?? '') : undefined;
    let reason: string | undefined;
    if (this.#repeat >= REPEAT_LIMIT) reason = `the same ${key} call produced the same page state ${this.#repeat} times`;
    else if (this.#failures >= FAILURE_LIMIT) reason = `${key} failed ${this.#failures} times in a row`;
    else if (this.#unproductive >= UNPRODUCTIVE_LIMIT) reason = `${this.#unproductive} actions in a row failed or changed nothing`;
    if (!reason) return { stalled: false, exhausted: false };
    const errorStreak = this.#failures >= FAILURE_LIMIT && this.#repeat < REPEAT_LIMIT;
    this.#repeat = 0;
    this.#failures = 0;
    this.#failureKey = '';
    this.#unproductive = 0;
    this.#lastCall = '';
    this.#stalls++;
    // Error streaks have their own guard (guards.ts); this counts the dead ends where actions went through and changed nothing.
    if (!errorStreak) this.#stallsSinceProgress++;
    return { stalled: true, reason, exhausted: false, directive: this.#directive(reason, lastDiagnosis), ...(lastDiagnosis ? { diagnosis: lastDiagnosis } : {}) };
  }

  #directive(reason: string, diagnosis?: Diagnosis): string {
    const tried = [...this.#ledger].map(([c, e]) => `${KIND_WORDS[c]} x${e.attempts}${e.failed || e.unchanged ? ` (${e.failed} failed, ${e.unchanged} changed nothing)` : ''}`);
    const untried = [...this.#available].filter(c => !this.#ledger.has(c) && c !== 'navigate' && c !== 'workers').map(c => KIND_WORDS[c]);
    const cause = diagnosis && CAUSE[diagnosis] ? `Most likely: ${CAUSE[diagnosis]}.` : 'Work out the cause from the latest observation before acting again.';
    const parts = [
      `Not making progress: ${reason}.`,
      tried.length ? `Tried so far: ${tried.join('; ')}.` : '',
      cause,
      diagnosis ? directiveFor(diagnosis) : '',
      'Decide from what the page shows now, and take a method or target that differs materially from the one that failed.',
      untried.length ? `Available and not yet tried in this task: ${untried.join('; ')}.` : 'Every kind of method available to you has been tried.',
      this.#stalls >= 3 || !untried.length
        ? 'If the evidence says nothing available can do this (a login, a missing permission, an input only the user has, a feature the application does not offer), say exactly what, keep the verified work, and finish with done(partial).'
        : '',
    ];
    return parts.filter(Boolean).join(' ');
  }
}
