// Guards against loops. A nudge is a note on the tool result that caused it; a stop ends the run with one salvage call.
// Counters belong to the run and are not reset by navigation.
import type { Result } from '@src/browser-control';
import type { GuardState } from '@src/store/types';
import { EMPTY_GUARDS } from '@src/store/types';

export const REPEAT_WINDOW = 6;
export const REPEAT_LIMIT = 3;
export const NO_EFFECT_NUDGE = 2;
/** Repeated failure is first a change-of-method note (never a stop); the stops below are far-off backstops against an environment that is plainly broken. */
export const NO_EFFECT_STRONG = 3;
export const NO_EFFECT_STOP = 10;
export const ERROR_NUDGE = 5;
export const ERROR_STOP = 20;
/**
 * Calls in a row on one page (same tab and address) after which nothing on it has changed: no action had an effect, nothing navigated. Twenty such calls
 * (about two minutes of looking and trying) mean the thing asked for is not reachable there; the run ends with what it found instead of trying for many
 * more minutes. A read further into a long page (an offset) is progress and is not counted.
 */
export const STILL_STOP = 20;
export const STILL_NUDGE = 12;
export const STILL_FINAL = 16;
/** Calls in a row that only looked at pages before the agent is told to act or finish. */
export const READ_STREAK_NUDGE = 5;
/**
 * A run that keeps making only the same one or two calls with no change to the page (A, A, A... or A, B, A, B...) is going in circles. The window
 * of recent calls has to be full, hold at most two distinct calls and none that changed anything; this many calls later in that state the run stops.
 * Polling (`wait`, `parallel_task_status`) and any call whose outcome was `changed` are not cycles.
 */
export const CYCLE_NUDGE = 4;
export const CYCLE_STOP = 16;
const POLLING_TOOLS = new Set([
  'wait', 'parallel_task_status',
  // Work that is not on the current page: a read of another address, data the run holds, a search, a skill, a plan. It cannot "change nothing on this page", so it never counts
  // toward the dead-end stop (a research run that fetches many sources is making progress, not repeating itself).
  'http_get', 'python_repl', 'data_ops', 'calculate', 'browser_data', 'web_search', 'find_free_times', 'find_skill', 'read_skill', 'plan', 'macro', 'read_attachment', 'plugin_search', 'plugin_read', 'plugin_action_search', 'plugin_chain',
]);

export interface GuardVerdict {
  nudge?: string;
  stop?: string;
  reobserve?: boolean;
  /** Which guard stopped the run. */
  guard?: 'errors' | 'no_effect';
}

const NO_EFFECT_TOOLS = new Set(['click', 'set', 'type', 'press', 'fill_form']);

/**
 * Writes the server refused. An action's receipt lists the requests it started with their status (`request: POST «/api/orders/fulfill» → 500 (...)`). A write
 * (POST, PUT, PATCH, DELETE) answered 4xx or 5xx, or one that failed on the network, did not happen, whatever the page prints next to it. The first such answer
 * is a nudge to check the saved state and not to press the control again to see what happens; the same write refused a second time stops the retrying: the
 * blocker is reported with what was verified, not tried a third time.
 */
export function refusedWrites(text: string | undefined): Array<{ write: string; why: string }> {
  if (!text) return [];
  const out: Array<{ write: string; why: string }> = [];
  for (const m of text.matchAll(/request: (POST|PUT|PATCH|DELETE) «([^»]+)»(?: → (\d{3})| FAILED (\S+))/g)) {
    const status = m[3] ? Number(m[3]) : undefined;
    if (status !== undefined && status < 400) continue;
    out.push({ write: `${m[1]} ${m[2]}`, why: status !== undefined ? `HTTP ${status}` : `network failure ${m[4]}` });
  }
  return out;
}
const LOOKING_TOOLS = new Set(['snapshot', 'read', 'find', 'screenshot']);

/** The tab a recorded look was at: its tabId, or the active tab when it named none. */
function lookedAt(signature: string): string {
  try {
    const args = JSON.parse(signature.slice(signature.indexOf(' ') + 1, signature.lastIndexOf(' → '))) as { tabId?: unknown };
    return String(args.tabId ?? 'active');
  } catch {
    return 'active';
  }
}

/**
 * The newest recorded calls, in a row, that only looked at a page, and how many different tabs they looked at. A task that reads
 * many different pages is not a loop: only repeated looks at the same one or two pages are.
 */
function lookingStreak(recent: readonly string[]): { count: number; tabs: number } {
  const looks: string[] = [];
  for (let i = recent.length - 1; i >= 0 && LOOKING_TOOLS.has(recent[i].split(' ')[0]); i--) looks.push(recent[i]);
  return { count: looks.length, tabs: new Set(looks.map(lookedAt)).size };
}

function targetKey(args: Record<string, unknown>, result: Result | undefined): string | null {
  const target = result?.receipt?.target?.replace(/^\[[^\]]+\] /, '') ?? args.target ?? args.submit;
  const tab = result?.page?.tabId ?? args.tabId;
  return target ? JSON.stringify([tab ?? null, target]) : null;
}

/** The signature of a call: tool, arguments (the agent's purpose left out) and what came of it. */
export function signature(
  tool: string,
  args: Record<string, unknown>,
  result: Result | undefined,
  isError: boolean,
): string {
  const rest = Object.fromEntries(Object.entries(args).filter(([k]) => k !== 'intent'));
  const outcome = result
    ? result.ok
      ? (result.receipt?.effect.verdict ?? 'ok')
      : (result.error?.code ?? 'error')
    : isError
      ? 'error'
      : 'ok';
  return `${tool} ${JSON.stringify(rest)} → ${outcome}`;
}

/**
 * Repeats that are not the same click again but the same kind of wasted work: the same tool search, the same page opened again, the
 * same repository file read again, the same worker research started twice. Each gets a note that names the changed approach and keeps
 * what is already done. Counted for the run in memory (a restart starts counting again, which only makes the note come later).
 */
const WASTE_LIMITS: Array<{ tools: string[]; key: (a: Record<string, unknown>) => string | null; limit: number; note: string }> = [
  { tools: ['plugin_search', 'plugin_action_search'], limit: 2, key: a => (typeof a.query === 'string' ? a.query.trim().toLowerCase() : null),
    note: 'this tool search was already run in this task and its tools are listed above. Call one of those tools now, or change the method (a free public API, the browser, another connected app). Do not search with the same words again.' },
  { tools: ['navigate', 'tabs'], limit: 3, key: a => (typeof a.url === 'string' ? a.url.replace(/#.*$/, '') : null),
    note: 'you opened this same page 3 times. Use what you already read from it, or take a different route (another page, a search, a connected app). Keep the progress so far.' },
  { tools: ['http_get'], limit: 4, key: a => (typeof a.url === 'string' ? (/github(?:usercontent)?\.com\/([^/]+\/[^/]+)/i.exec(a.url)?.[1]?.toLowerCase() ?? null) : null),
    note: 'you have read this repository 4 times. You know enough to decide: use it, or say what is missing and finish the outcome another way.' },
  { tools: ['delegate', 'start_parallel_tasks'], limit: 2, key: a => JSON.stringify(a).slice(0, 300),
    note: 'this same research was already handed to workers in this task. Use their results, do not start it again.' },
];

export class Guards {
  state: GuardState;
  readonly #waste = new Map<string, number>();

  constructor(state: GuardState = EMPTY_GUARDS) {
    this.state = structuredClone(state);
  }

  /** Records one call's outcome and says whether to nudge or stop. A stop or an older note wins over the wasted-work note. */
  record(tool: string, args: Record<string, unknown>, result: Result | undefined, isError: boolean): GuardVerdict {
    let waste: string | undefined;
    for (const rule of WASTE_LIMITS) {
      if (!rule.tools.includes(tool)) continue;
      const k = rule.key(args);
      if (!k) continue;
      const id = rule.tools[0] + '|' + k;
      const count = (this.#waste.get(id) ?? 0) + 1;
      this.#waste.set(id, count);
      if (count >= rule.limit) waste = rule.note;
    }
    const verdict = this.#check(tool, args, result, isError);
    const refused = this.#refusedWrite(result);
    if (refused && !verdict.stop) return refused;
    return waste && !verdict.stop && !verdict.nudge ? { ...verdict, nudge: waste } : verdict;
  }

  /** A write the server refused: a nudge the first time, a stop the second time for the same write. */
  #refusedWrite(result: Result | undefined): GuardVerdict | undefined {
    const refused = refusedWrites(result?.text);
    if (!refused.length) return undefined;
    const counts = (this.state.writeFails ??= {});
    let worst: { write: string; why: string; n: number } | undefined;
    for (const r of refused) {
      counts[r.write] = (counts[r.write] ?? 0) + 1;
      if (!worst || counts[r.write]! > worst.n) worst = { ...r, n: counts[r.write]! };
    }
    if (!worst) return undefined;
    if (worst.n >= 2) return { stop: `the server refused the same write twice (${worst.write}: ${worst.why}); it did not happen, whatever the page shows.`, guard: 'errors' };
    return { nudge: `The server refused this write (${worst.write}: ${worst.why}): it did NOT happen, whatever the page now shows. Do not press the control again to see what happens. Check the saved state, then fix the cause (a required field, the account, a stale page) or report the failure with what you verified.` };
  }

  #check(tool: string, args: Record<string, unknown>, result: Result | undefined, isError: boolean): GuardVerdict {
    const s = this.state;
    const sig = signature(tool, args, result, isError);
    s.recent = [...s.recent, sig].slice(-REPEAT_WINDOW);
    // Calls in a row on one page that changed nothing there (STILL_STOP). Failed calls count too: a page where every attempt fails or does nothing is the same dead end.
    // A failed call carries no page of its own; it belongs to the page the run is on. Waiting (a slow page, workers' progress) is not counted.
    let still = s.still;
    if (!POLLING_TOOLS.has(tool)) {
      const page = result?.page ? `${result.page.tabId ?? ''}|${result.page.url ?? ''}` : (tool === 'navigate' || tool === 'tabs') && typeof args.url === 'string' ? `${args.tabId ?? ''}|${args.url}` : s.still?.page ?? `${args.tabId ?? ''}|`;
      // Focus moving (Tab, Shift+Tab) is a change, but not one that gets anywhere on its own.
      const signals = result?.receipt?.effect.signals ?? [];
      const focusOnly = signals.length > 0 && signals.every(x => /^focus /.test(x));
      const moved = (result?.receipt?.effect.verdict === 'changed' && !focusOnly) || (tool === 'read' && typeof args.offset === 'number' && args.offset > 0);
      // Counted per page since the last real change, so leaving a page and coming back (a detour to a linked page, a reload) does not restart its count.
      const byPage = moved ? {} : { ...(s.still?.byPage ?? (s.still ? { [s.still.page]: s.still.calls } : {})) };
      if (!moved) byPage[page] = (byPage[page] ?? 0) + 1;
      const keys = Object.keys(byPage);
      if (keys.length > 12) delete byPage[keys[0]!];
      still = { page, calls: byPage[page] ?? 0, byPage };
      s.still = still;
    }
    s.errorsInRow = isError ? s.errorsInRow + 1 : 0;
    if (s.errorsInRow >= ERROR_STOP) return { stop: `${ERROR_STOP} calls in a row failed.`, guard: 'errors' };
    if (s.errorsInRow >= ERROR_NUDGE && s.errorsInRow % ERROR_NUDGE === 0) {
      return { nudge: `${s.errorsInRow} calls in a row failed. Read the exact error of the last one, say what it means, and switch to a materially different method (a different tool, the screenshot and a pointer action, a keyboard shortcut, the application's own command or script console, a connected API). Keep the work already done.`, reobserve: true };
    }

    if (still && !POLLING_TOOLS.has(tool)) {
      if (still.calls >= STILL_STOP) return { stop: `${still.calls} calls on this page in a row changed nothing on it: what was asked for is not reachable there with the controls the page shows.`, guard: 'no_effect' };
      if (still.calls === STILL_FINAL) return { nudge: `${still.calls} calls on this page changed nothing and the last reminder was not followed. Your next call must be done: say what you found and what is not there, with outcome partial or failed. Do not try another variation.`, reobserve: false };
      if (still.calls === STILL_NUDGE) return { nudge: `${still.calls} calls on this page in a row changed nothing on it. If what you are looking for is not on this page, say so now with what you found (done with outcome partial or failed and the evidence); otherwise take an action that changes something.` };
    }

    const key = NO_EFFECT_TOOLS.has(tool) ? targetKey(args, result) : null;
    if (key && (result?.receipt?.postcondition?.status === 'met' || result?.receipt?.effect.verdict === 'changed')) {
      delete s.noEffect[key];
    }
    if (
      key &&
      result?.ok &&
      result.receipt?.effect.verdict === 'none' &&
      result.receipt.postcondition?.status !== 'met'
    ) {
      const count = (s.noEffect[key] ?? 0) + 1;
      s.noEffect[key] = count;
      if (count >= NO_EFFECT_STOP)
        return { stop: `${tool} on the same target had no effect ${count} times.`, guard: 'no_effect' };
      if (count >= NO_EFFECT_STRONG) {
        const signals = result.receipt.effect.signals.join(' · ') || 'no signal';
        return { nudge: `${tool} on this target had no effect ${count} times (${signals}). Stop repeating it: observe the page again and use a different way to reach the goal (another element, a pointer action from a screenshot, a keyboard path, the application's command interface).`, reobserve: true };
      }
      if (count >= NO_EFFECT_NUDGE) {
        const signals = result.receipt.effect.signals.join(' · ') || 'no signal';
        return {
          nudge: `${tool} on this target had no effect ${count} times (${signals}). Try another way, or ask the user.`,
          reobserve: true,
        };
      }
    }
    const cycling =
      s.recent.length >= REPEAT_WINDOW &&
      new Set(s.recent).size <= 2 &&
      !s.recent.some(r => r.endsWith('→ changed') || POLLING_TOOLS.has(r.split(' ')[0]));
    s.cycle = cycling ? (s.cycle ?? 0) + 1 : 0;
    if (s.cycle >= CYCLE_NUDGE && s.cycle < CYCLE_STOP && s.cycle % 2 === 0) {
      return { nudge: 'You are repeating the same calls and nothing on the page changes. Diagnose why, then take a materially different approach; do not repeat these calls.', reobserve: true };
    }
    if (s.cycle >= CYCLE_STOP) {
      return {
        stop: `the last ${REPEAT_WINDOW + s.cycle - 1} calls were only ${new Set(s.recent).size === 1 ? 'the same call' : 'two calls repeated'} and none changed the page.`,
        guard: 'no_effect',
      };
    }
    const repeats = s.recent.filter(r => r === sig).length;
    if (
      NO_EFFECT_TOOLS.has(tool) &&
      result?.error?.delivered === false &&
      ['REF_NOT_PRESENTED', 'REF_UNKNOWN', 'STALE_DOCUMENT', 'NODE_DETACHED', 'TARGET_CHANGED',
        'NOT_VISIBLE', 'NOT_STABLE', 'OBSCURED', 'INTERCEPTED', 'NO_MATCH'].includes(result.error.code) &&
      repeats === 1
    ) {
      return { reobserve: true };
    }
    if (repeats >= REPEAT_LIMIT) {
      return {
        nudge: `you made the same call with the same outcome ${repeats} times in your last ${REPEAT_WINDOW} calls. Try something else, or ask the user.`,
      };
    }
    // Re-reading the page again and again is the other loop: every look is a model turn, and none of them moves the task on.
    const looks = lookingStreak(s.recent);
    if (LOOKING_TOOLS.has(tool) && looks.count >= READ_STREAK_NUDGE && looks.tabs <= 2) {
      return {
        nudge: `your last ${looks.count} calls only looked at the same page${looks.tabs > 1 ? 's' : ''}. Do not read it again: if you have what the task needs, finish with done; if a step is left, do it now.`,
      };
    }
    return {};
  }
}
