'use client';

/**
 * The chatbar send icon.
 *
 * One icon that covers the whole send lifecycle, replacing the sailing boat. The
 * three states are drawn from the same 24×24 box so the glyph swaps in place
 * without the button resizing or the row reflowing:
 *
 *   idle      → the stroke-drawn send trail, which is the resting shape
 *   sending   → a stop square inside a sweeping ring, so the click has an
 *   thinking    immediate result and the button doubles as the stop control
 *   launched  → a check that draws itself once, then the state machine in
 *               TerminalChatBar returns to idle after 1.4s
 *
 * Plain SVG and CSS rather than `motion/react`: this sits in the chatbar, which is
 * mounted on every workspace route, and the whole behaviour here is three keyframe
 * animations. Reduced motion is handled in globals.css, where the sweep and the
 * draw are stilled but each state stays visually distinct.
 */

export type SendButtonState = 'idle' | 'sending' | 'thinking' | 'launched';

/** True while a response is in flight, i.e. the button acts as Stop. */
export function isSendBusy(state: SendButtonState | undefined): boolean {
  return state === 'sending' || state === 'thinking';
}

export function ChatBarSendIcon({
  state = 'idle',
  size = 20,
  className,
}: {
  state?: SendButtonState;
  size?: number;
  className?: string;
}) {
  const busy = isSendBusy(state);
  const done = state === 'launched';

  return (
    <span
      className={`xv-sendicon ${className ?? ''}`}
      data-state={busy ? 'busy' : done ? 'done' : 'idle'}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {/* idle — a wave that runs into an arrowhead. The wave and the head are
            separate paths so the head can nudge forward on hover without dragging
            the wave with it. */}
        <path
          className="xv-sendicon__trail"
          d="M2.6 12q2.4-4.6 4.8 0t4.8 0 4.8 0"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          className="xv-sendicon__head"
          d="m17.2 8.4 3.6 3.6-3.6 3.6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* busy — sweeping ring plus a stop square */}
        <circle className="xv-sendicon__track" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <circle
          className="xv-sendicon__sweep"
          cx="12"
          cy="12"
          r="9"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          pathLength={100}
        />
        <rect className="xv-sendicon__stop" x="9" y="9" width="6" height="6" rx="1.6" fill="currentColor" />

        {/* complete — a check that draws once */}
        <path
          className="xv-sendicon__check"
          d="m6.5 12.4 3.6 3.6 7.4-7.9"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={100}
        />
      </svg>
    </span>
  );
}
