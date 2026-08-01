'use client';

/**
 * The execution terminal.
 *
 * Replaces the phase panel, the fixed to-do checklist, and the progress counter.
 * Everything rendered here came from a received SSE event; there is no timer, no
 * simulated advance, and no state the backend did not report.
 *
 * The panel keeps a fixed dark code-terminal treatment in all four themes, while
 * the chrome around it follows the selected theme. A terminal that restyles
 * itself per theme stops reading as a terminal, and the point of this surface is
 * that it looks like the thing it is.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { TerminalRunState } from '@/lib/terminal/terminalEvent';
import { TerminalEventRow } from './TerminalEventRow';

/**
 * Rows rendered at the tail of a long run. A build can emit thousands of events,
 * and mounting all of them makes scrolling stutter on mid-range hardware. The head
 * stays reachable through the expand control rather than being discarded.
 */
const TAIL_LIMIT = 300;

function elapsedLabel(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

export function TerminalRunStream({
  run,
  startedAt,
  className,
}: {
  run: TerminalRunState;
  startedAt?: number | null;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const [showAll, setShowAll] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const hidden = Math.max(0, run.events.length - TAIL_LIMIT);
  const visible = useMemo(
    () => (showAll || hidden === 0 ? run.events : run.events.slice(-TAIL_LIMIT)),
    [run.events, showAll, hidden],
  );

  // Elapsed time is measured, not estimated, and only ticks while the run is
  // active — a frozen clock on a finished run is the honest display.
  useEffect(() => {
    if (!run.active || !startedAt) return;
    const tick = () => setElapsed(Date.now() - startedAt);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [run.active, startedAt]);

  // Follow the tail only while the user is already at the bottom. Yanking the
  // viewport back while someone is reading earlier output is the single most
  // irritating thing a live log can do.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [visible.length]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
  }

  if (run.events.length === 0 && !run.active) return null;

  const statusText = run.active
    ? 'running'
    : run.outcome === 'success'
      ? 'completed'
      : run.outcome === 'failure'
        ? 'failed'
        : 'interrupted';

  return (
    <section
      className={cn('xv-term', className)}
      data-state={statusText}
      aria-label="Execution log"
    >
      <header className="xv-term-head">
        <span className="xv-term-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="xv-term-title">execution</span>
        <span className={cn('xv-term-state', `xv-term-state--${statusText}`)}>
          {run.active ? <i className="xv-term-pulse" aria-hidden="true" /> : null}
          {statusText}
        </span>
        {elapsed > 0 ? <span className="xv-term-elapsed">{elapsedLabel(elapsed)}</span> : null}
      </header>

      {run.pendingPermissions.length > 0 ? (
        <div className="xv-term-permission" role="status">
          {run.pendingPermissions.map((permission) => (
            <p key={permission}>{permission}</p>
          ))}
        </div>
      ) : null}

      <div className="xv-term-scroll" ref={scrollRef} onScroll={onScroll}>
        {hidden > 0 && !showAll ? (
          <button type="button" className="xv-term-more" onClick={() => setShowAll(true)}>
            Show {hidden} earlier {hidden === 1 ? 'line' : 'lines'}
          </button>
        ) : null}

        {visible.map((event) => (
          <TerminalEventRow key={event.seq} event={event} />
        ))}

        {run.active && run.events.length === 0 ? (
          // Honest empty state: the stream is open and nothing has arrived. It says
          // exactly that, instead of inventing a step to fill the space.
          <div className="xv-term-row xv-term-row--info">
            <span className="xv-term-marker" aria-hidden="true">
              $
            </span>
            <span className="xv-term-body">
              <span className="xv-term-text xv-term-waiting">waiting for first event</span>
            </span>
          </div>
        ) : null}
      </div>

      {!run.active ? (
        <footer className="xv-term-foot">
          {run.events.length} {run.events.length === 1 ? 'event' : 'events'} · {statusText}
        </footer>
      ) : null}
    </section>
  );
}
