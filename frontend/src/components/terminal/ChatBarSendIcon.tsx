'use client';

import { LeafLoader } from '@/components/ui/LeafLoader';

/**
 * The chatbar send icon.
 *
 * One icon that covers the whole send lifecycle. Every state is drawn from the same
 * 24×24 box so the glyph swaps in place without the button resizing or the row
 * reflowing:
 *
 *   idle      → the stroke-drawn send trail, the resting shape
 *   sending   → the leaf preloader, while the submit request is in flight
 *   thinking  → a stop square inside a sweeping ring; the button is the stop
 *               control while a response streams back
 *   launched  → a check that draws itself once, then the state machine in
 *               TerminalChatBar returns to idle after 1.4s
 *
 * `sending` and `thinking` are deliberately different pictures. They used to share
 * the stop treatment, but they are not the same thing to a user: during `sending`
 * there is nothing to stop yet and a second submit must not fire, so the control is
 * disabled and shows a loader; during `thinking` there is a response to abort, so
 * the control stays live and shows Stop. Collapsing them would have meant either
 * losing the ability to stop a response, or offering a stop button for a request
 * that has not left yet.
 *
 * Plain SVG and CSS rather than `motion/react`: this sits in the chatbar, which is
 * mounted on every workspace route, and the whole behaviour here is a handful of
 * keyframes. Reduced motion is handled in globals.css, where the sweep, the draw
 * and the leaf rotation are stilled but each state stays visually distinct.
 */

export type SendButtonState = 'idle' | 'sending' | 'thinking' | 'launched';

/**
 * True while the control is not a send button: either the submit is in flight
 * (`sending`) or a response is streaming and the control acts as Stop
 * (`thinking`).
 */
export function isSendBusy(state: SendButtonState | undefined): boolean {
  return state === 'sending' || state === 'thinking';
}

/** True only while the submit request itself is in flight. */
export function isSendLoading(state: SendButtonState | undefined): boolean {
  return state === 'sending';
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
  const loading = isSendLoading(state);
  const busy = isSendBusy(state) && !loading;
  const done = state === 'launched';

  // The loader replaces the glyph outright rather than layering over it, and it is
  // rendered at the same box size, so the button's contents never change dimensions.
  if (loading) {
    return (
      <span
        className={`xv-sendicon ${className ?? ''}`}
        data-state="loading"
        style={{ width: size, height: size }}
      >
        <LeafLoader size={size} />
      </span>
    );
  }

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
