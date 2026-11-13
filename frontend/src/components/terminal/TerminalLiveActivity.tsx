'use client';

import { useEffect, useMemo, useState } from 'react';

import { ActivityTimeline } from '@/components/activity/ActivityTimeline';
import {
  coalesceActivity,
  type XrogaActivityPresentation,
} from '@/lib/terminal/activityPresentation';
import { buildActivityTimeline, formatElapsed, pendingWorkLabel } from '@/lib/terminal/activityTimeline';
import type { TerminalRunState } from '@/lib/terminal/terminalEvent';

/** Nothing new for this long is worth saying out loud, and only as a measured fact. */
const STALLED_AFTER_MS = 9_000;

interface TerminalLiveActivityProps {
  run?: TerminalRunState;
  activity?: readonly XrogaActivityPresentation[];
  pending?: boolean;
}

/**
 * Activity for one assistant message. All rows come from canonical execution events (`run.events`) or from
 * activity already persisted with the message, and there is no percentage or invented step anywhere here.
 * A pending message with no event yet shows one quiet line and is never stored as evidence.
 */
export function TerminalLiveActivity({
  run,
  activity,
  pending = false,
}: TerminalLiveActivityProps) {
  const [now, setNow] = useState(() => Date.now());
  const [mountedAt] = useState(() => Date.now());

  const rows = useMemo(() => {
    if (activity) return [...activity];
    if (run) return coalesceActivity(run.events);
    return [];
  }, [activity, run]);
  const active = !run?.outcome && Boolean(run?.active || pending);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  const model = useMemo(
    () => buildActivityTimeline(rows, {
      runActive: active,
      outcome: run?.outcome ?? null,
    }),
    [rows, active, run?.outcome],
  );

  const lastObservableAt = Math.max(
    run?.startedAt ?? mountedAt,
    run?.events.at(-1)?.at ?? 0,
    ...rows.map((row) => row.updatedAt),
  );
  const silentForMs = Math.max(0, now - lastObservableAt);
  const note = active && silentForMs >= STALLED_AFTER_MS && model.state !== 'waiting'
    ? `No new update for ${formatElapsed(silentForMs)}`
    : undefined;

  if (rows.length === 0 && !active && !run?.outcome) return null;

  const label = pendingWorkLabel(run?.events ?? [], rows.length > 0);
  const shell = rows.length === 0 && active;
  return (
    <div
      data-testid="terminal-live-activity"
      data-state={shell ? 'pending' : active ? 'active' : 'settled'}
    >
      <ActivityTimeline model={model} now={now} runStartedAt={run?.startedAt ?? mountedAt} pendingLabel={label} note={note} />
    </div>
  );
}
