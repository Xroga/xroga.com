/**
 * The single backend → terminal translation point.
 *
 * Every raw SSE payload enters here and leaves as zero or more `TerminalEvent`
 * rows. No React component may read raw payload fields directly; if a new field
 * needs to reach the UI, it is mapped here first. That rule is what keeps the
 * surfaces from drifting apart the way the previous four components did.
 *
 * Returning an array (rather than one row) matters: a single `progress` payload can
 * legitimately carry both a status line and a newly-blocked permission, and both
 * are real facts that belong in the log. Returning `[]` is also normal — keepalives
 * and empty payloads produce nothing, because a terminal must not show a row for
 * "the connection is still open".
 */

import type { TerminalEvent, TerminalEventKind, TerminalEventLevel } from './terminalEvent';
import { redactTerminalText } from './terminalRedaction';
import { capacityUnavailableLine } from '../capacityMessage';

/** Raw payload as received. Deliberately loose — this is untrusted input. */
export type RawTerminalPayload = Record<string, unknown>;

export interface AdapterContext {
  /** Sequence number of the last row emitted; the adapter assigns from here. */
  fromSeq: number;
  /** Receipt time, injected so tests are deterministic. */
  now?: number;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Keepalives are sent every 15s purely to hold the connection open. They carry
 * `message: 'Working…'`, which the old UI displayed — making an idle stream look
 * like active work. They must never produce a row.
 */
function isKeepalive(payload: RawTerminalPayload): boolean {
  return payload.keepalive === true;
}

function levelFor(event: string, payload: RawTerminalPayload): TerminalEventLevel {
  if (event === 'error' || payload.error) return 'error';
  if (event === 'slow_request' || event === 'billing_webhook_failed') return 'warn';
  if (event === 'complete') return payload.success === false ? 'error' : 'success';
  return 'info';
}

function kindFor(event: string): TerminalEventKind | null {
  switch (event) {
    case 'start':
    case 'pipeline':
      return 'session';
    case 'progress':
    case 'slow_request':
      return 'status';
    case 'delta':
      return 'output';
    case 'preview':
      return 'artifact';
    case 'complete':
      return 'result';
    case 'error':
    case 'billing_webhook_failed':
      return 'failure';
    // `done` closes the HTTP stream and carries no information of its own; the
    // preceding `complete` or `error` already recorded the outcome.
    case 'done':
      return null;
    default:
      return null;
  }
}

/**
 * Text for a row, in payload-field priority order. `swarmActivity` is the most
 * specific real activity line the backend produces, so it wins over the generic
 * `message`; `status` is last because it is often a bare enum like `running`.
 */
function textFor(event: string, payload: RawTerminalPayload): string | null {
  if (event === 'delta') return str(payload.delta);
  if (event === 'error') {
    const base = str(payload.error) ?? 'Run failed';
    return payload.code === 'CAPACITY_UNAVAILABLE'
      ? capacityUnavailableLine(base, payload.nextUnlockAt)
      : base;
  }
  if (event === 'preview') return 'Preview build ready';
  if (event === 'complete') {
    return payload.success === false ? 'Run finished with errors' : 'Run complete';
  }
  return (
    str(payload.swarmActivity) ??
    str(payload.message) ??
    str(payload.swarmStatusLabel) ??
    str(payload.status)
  );
}

/** Permission gates the backend can signal. Names are fixed, not user-supplied. */
const PERMISSION_FLAGS: ReadonlyArray<readonly [string, string]> = [
  ['needsGitHub', 'GitHub authorisation required'],
  ['needsVercel', 'Vercel authorisation required'],
  ['needsRepoPick', 'Repository selection required'],
];

export function adaptTerminalEvent(
  event: string,
  payload: RawTerminalPayload,
  context: AdapterContext,
): TerminalEvent[] {
  const rows: TerminalEvent[] = [];
  const at = context.now ?? Date.now();
  let seq = context.fromSeq;

  const push = (
    kind: TerminalEventKind,
    level: TerminalEventLevel,
    text: string,
    body: string | null,
  ) => {
    rows.push({
      seq: ++seq,
      kind,
      level,
      source: str(payload.agent),
      // Redacted at the boundary, so no downstream component can render an
      // unmasked value even by accident.
      text: redactTerminalText(text),
      body: body ? redactTerminalText(body) : null,
      at,
      rawEvent: event,
    });
  };

  // Permission gates are checked before the keepalive bail-out: the backend can
  // attach `needsGitHub` to a keepalive, and a blocked run must surface that even
  // though the keepalive itself is not progress.
  for (const [flag, label] of PERMISSION_FLAGS) {
    if (payload[flag] === true) push('permission', 'warn', label, null);
  }

  if (isKeepalive(payload)) return rows;

  const kind = kindFor(event);
  if (!kind) return rows;

  const text = textFor(event, payload);
  if (!text) return rows;

  const body = str(payload.detail) ?? str(payload.stack) ?? null;
  push(kind, levelFor(event, payload), text, body);

  return rows;
}
