/**
 * Append-only run state.
 *
 * Two properties the old UI lacked and needed:
 *
 * 1. **Rows are never rewritten.** The previous checklist mutated a fixed seven-item
 *    list in place, so the display could move backwards and a completed step could
 *    silently un-complete. Here a row, once appended, is immutable — the log is a
 *    record of what happened, so editing history would make it a fiction.
 *
 * 2. **Duplicates are dropped by sequence number.** Reconnection replays from
 *    `lastSeq`, and an overlapping replay is normal rather than exceptional. Without
 *    this the terminal would print the tail of the run twice on every reconnect.
 */

import { EMPTY_RUN_STATE, type TerminalEvent, type TerminalRunState } from './terminalEvent';

export type TerminalRunAction =
  | { type: 'run-started'; at?: number }
  | { type: 'events'; events: TerminalEvent[] }
  | { type: 'interrupted' }
  | { type: 'stream-closed' }
  | { type: 'reset' };

/** Kinds that end a run. Anything else leaves it active. */
function outcomeFor(event: TerminalEvent): TerminalRunState['outcome'] | null {
  if (event.kind === 'result') return event.level === 'error' ? 'failure' : 'success';
  if (event.kind === 'failure') return 'failure';
  return null;
}

export function terminalRunReducer(
  state: TerminalRunState,
  action: TerminalRunAction,
): TerminalRunState {
  switch (action.type) {
    case 'run-started':
      // A new run starts from empty rather than appending to the previous one, so
      // two runs can never be read as a single longer one. `startedAt` is stamped
      // here — the client knows when it sent the request, and that is the only honest
      // basis for the elapsed time shown before the first event arrives.
      return { ...EMPTY_RUN_STATE, active: true, startedAt: action.at ?? Date.now() };

    case 'events': {
      const fresh = action.events.filter((event) => event.seq > state.lastSeq);
      if (fresh.length === 0) return state;

      let outcome = state.outcome;
      for (const event of fresh) {
        // First terminal event wins. A late `error` after a successful `complete`
        // must not overwrite the result the user already saw.
        if (!outcome) outcome = outcomeFor(event) ?? null;
      }

      const permissions = new Set(state.pendingPermissions);
      for (const event of fresh) {
        if (event.kind === 'permission') permissions.add(event.text);
      }

      return {
        ...state,
        events: [...state.events, ...fresh],
        active: outcome === null,
        outcome,
        lastSeq: fresh[fresh.length - 1].seq,
        pendingPermissions: [...permissions],
      };
    }

    case 'interrupted':
      // Only meaningful while running; a finished run cannot become interrupted.
      if (!state.active) return state;
      return { ...state, active: false, outcome: 'interrupted' };

    case 'stream-closed':
      // The socket dropping is not itself an outcome. If the run already reported
      // one, keep it; otherwise mark it interrupted, because a run whose stream
      // vanished mid-flight did not succeed and must not appear to be still going.
      if (!state.active) return state;
      return { ...state, active: false, outcome: 'interrupted' };

    case 'reset':
      return EMPTY_RUN_STATE;

    default:
      return state;
  }
}
