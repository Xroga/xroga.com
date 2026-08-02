'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { TerminalEvent, TerminalRunState } from '@/lib/terminal/terminalEvent';
import { formatElapsed, waitingLine } from '@/lib/terminal/liveActivityText';

/**
 * What the terminal shows while a run is in flight.
 *
 * Reported by a user with a screenshot: they sent "build a portfolio site with a dark
 * theme", their prompt appeared in a bubble, and everything below it was blank. The
 * build had in fact started — the owner could see it in the database — but the person
 * looking at the screen had no reason to believe that, so the product read as broken.
 *
 * Two causes, both addressed here. The backend went silent for the first twenty-two
 * seconds of a run (fixed separately, in `startupProgress` and `progressHeartbeat`),
 * and the UI rendered only the single most recent status line, which is invisible when
 * there is not yet a status line to render.
 *
 * The rule this component keeps: **nothing on screen may be a guess.** There is no
 * spinner standing in for unknown progress, no percentage, no fabricated checklist,
 * and no step that has not actually been reported. Exactly two things are displayed:
 *
 * 1. The rows the backend really sent, most recent last.
 * 2. Before any row exists, one line stating the true client-side fact — the request
 *    was sent and no reply has arrived yet — with the elapsed time, so a person can
 *    see the terminal is alive rather than frozen.
 *
 * The elapsed counter is the only moving element, and it measures something real.
 */

/** Rows kept on screen. Enough to read as a transcript, short enough not to shove the
 *  composer off a phone. Older rows are not lost — they stay in the run state. */
const VISIBLE_ROWS = 6;

const LEVEL_CLASS: Record<TerminalEvent['level'], string> = {
  info: 'text-[var(--muted)]',
  warn: 'text-amber-500',
  error: 'text-red-500',
  success: 'text-emerald-500',
};

function seconds(fromMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - fromMs) / 1000));
}

interface TerminalLiveActivityProps {
  run: TerminalRunState;
  /** Injected in tests; production reads the client clock. */
  now?: number;
}

export function TerminalLiveActivity({ run, now }: TerminalLiveActivityProps) {
  // Starts at the run's own start time rather than `Date.now()` so the first paint on
  // the server and the first paint on the client agree — a mismatched clock reading
  // here would be a hydration error on every build.
  const [tick, setTick] = useState<number | null>(null);

  useEffect(() => {
    if (!run.active || run.startedAt == null) {
      setTick(null);
      return;
    }
    setTick(Date.now());
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [run.active, run.startedAt]);

  if (!run.active) return null;

  const rows = run.events
    .filter((event) => event.kind !== 'output' && event.kind !== 'result')
    .slice(-VISIBLE_ROWS);

  const clock = now ?? tick;
  const elapsed =
    run.startedAt != null && clock != null ? seconds(run.startedAt, clock) : 0;

  return (
    <div
      className="xv-term-live font-mono text-xs"
      role="status"
      aria-live="polite"
      data-testid="terminal-live-activity"
    >
      {rows.length === 0 ? (
        <p className="xv-term-liveline" data-testid="terminal-waiting-line">
          <span className="xv-term-livedot" aria-hidden="true" />
          <span className="text-[var(--muted)]">{waitingLine(elapsed)}</span>
        </p>
      ) : (
        <>
          {rows.map((event, index) => {
            const isLatest = index === rows.length - 1;
            return (
              <p
                key={event.seq}
                className={cn('xv-term-liveline', !isLatest && 'xv-term-liveline--past')}
                data-testid={isLatest ? 'ai-processing-status' : undefined}
              >
                <span
                  className={cn('xv-term-livedot', isLatest && 'xv-term-livedot--active')}
                  aria-hidden="true"
                />
                <span className={LEVEL_CLASS[event.level]}>
                  {event.source ? `${event.source}: ` : ''}
                  {event.text}
                </span>
                {isLatest ? (
                  <span className="xv-term-liveclock" data-testid="terminal-elapsed">
                    {formatElapsed(elapsed)}
                  </span>
                ) : null}
              </p>
            );
          })}
        </>
      )}
    </div>
  );
}
