/**
 * Normalised execution-terminal event model.
 *
 * The backend stream is not a terminal feed. It emits ten SSE event names
 * (`start`, `pipeline`, `progress`, `delta`, `preview`, `complete`, `error`,
 * `slow_request`, `done`, `billing_webhook_failed`) whose payloads carry a wide
 * `SwarmProgressEvent` shape built for the old checklist UI — `swarmTodos`,
 * `negotiationPhase`, `userFacingPhase`, `councilLayer` and so on.
 *
 * A terminal needs something different: an ordered, append-only list of rows,
 * each one a thing that actually happened. This module defines that row type.
 * Nothing here invents state. Every field is derived from a received payload, so
 * a row can only exist if the backend sent something.
 *
 * Why one shared model instead of per-component mapping: the previous UI read
 * raw payload fields directly inside four separate components, so each held its
 * own opinion about what "building" meant and they drifted apart. Normalising
 * once, here, means a new surface cannot invent a fifth interpretation.
 */

/** What a row represents. Chosen to describe observable facts, not phases. */
export type TerminalEventKind =
  /** The stream opened. */
  | 'session'
  /** A named agent reported a status line. */
  | 'status'
  /** Assistant text arrived (streamed token or final message). */
  | 'output'
  /** A build artifact became available for preview. */
  | 'artifact'
  /** The run finished successfully. */
  | 'result'
  /** The run failed, or the backend reported a blocking condition. */
  | 'failure'
  /** The run needs an authorisation the user has not granted yet. */
  | 'permission';

export type TerminalEventLevel = 'info' | 'warn' | 'error' | 'success';

export interface TerminalEvent {
  /**
   * Monotonic sequence number assigned on receipt. Reconnection replays from the
   * last seen value, so ordering must not depend on timestamps — the backend
   * sets `timestamp` from its own clock and several payloads omit it entirely.
   */
  seq: number;
  kind: TerminalEventKind;
  level: TerminalEventLevel;
  /** Agent or subsystem that produced the row, when the payload names one. */
  source: string | null;
  /** Single-line summary. Always present; rows with no text are dropped. */
  text: string;
  /** Multi-line body (command output, error detail) when the payload carries one. */
  body: string | null;
  /** Receipt time in epoch ms, from the client clock — used only for elapsed display. */
  at: number;
  /** Raw backend event name, retained so a row can be traced to its origin. */
  rawEvent: string;
}

export interface TerminalRunState {
  events: TerminalEvent[];
  /** True between `start` and the terminal event that ends the run. */
  active: boolean;
  /**
   * Set once the run reaches a terminal state. `null` while running, so the UI can
   * distinguish "still going" from "finished with no result" — the old UI could not,
   * which is why it fell back to inventing a status.
   */
  outcome: 'success' | 'failure' | 'interrupted' | null;
  /** Highest sequence number applied. Sent on reconnect to resume the stream. */
  lastSeq: number;
  /** Authorisations the backend said are missing. Drives the permission prompt. */
  pendingPermissions: string[];
}

export const EMPTY_RUN_STATE: TerminalRunState = {
  events: [],
  active: false,
  outcome: null,
  lastSeq: 0,
  pendingPermissions: [],
};
