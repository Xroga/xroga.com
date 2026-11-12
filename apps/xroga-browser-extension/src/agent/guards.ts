// Guards against loops. A nudge is a note on the tool result that caused it; a stop ends the run with one salvage call.
// Counters belong to the run and are not reset by navigation.
import type { Result } from '@src/browser-control';
import type { GuardState } from '@src/store/types';
import { EMPTY_GUARDS } from '@src/store/types';

export const REPEAT_WINDOW = 6;
export const REPEAT_LIMIT = 3;
export const NO_EFFECT_NUDGE = 2;
export const NO_EFFECT_STOP = 3;
export const ERROR_STOP = 5;
/** Calls in a row that only looked at pages before the agent is told to act or finish. */
export const READ_STREAK_NUDGE = 5;
/**
 * A run that keeps making only the same one or two calls with no change to the page (A, A, A... or A, B, A, B...) is going in circles. The window
 * of recent calls has to be full, hold at most two distinct calls and none that changed anything; this many calls later in that state the run stops.
 * Polling (`wait`, `parallel_task_status`) and any call whose outcome was `changed` are not cycles.
 */
export const CYCLE_STOP = 4;
const POLLING_TOOLS = new Set(['wait', 'parallel_task_status']);

export interface GuardVerdict {
  nudge?: string;
  stop?: string;
  reobserve?: boolean;
  /** Which guard stopped the run. */
  guard?: 'errors' | 'no_effect';
}

const NO_EFFECT_TOOLS = new Set(['click', 'set', 'type', 'press', 'fill_form']);
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

export class Guards {
  state: GuardState;

  constructor(state: GuardState = EMPTY_GUARDS) {
    this.state = structuredClone(state);
  }

  /** Records one call's outcome and says whether to nudge or stop. */
  record(tool: string, args: Record<string, unknown>, result: Result | undefined, isError: boolean): GuardVerdict {
    const s = this.state;
    const sig = signature(tool, args, result, isError);
    s.recent = [...s.recent, sig].slice(-REPEAT_WINDOW);
    s.errorsInRow = isError ? s.errorsInRow + 1 : 0;
    if (s.errorsInRow >= ERROR_STOP) return { stop: `${ERROR_STOP} calls in a row failed.`, guard: 'errors' };

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
