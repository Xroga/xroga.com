'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { ActivityTimeline } from '@/components/activity/ActivityTimeline';
import {
  coalesceActivity,
  isGenericPlaceholderActivity,
  publicActivityText,
  type XrogaActivityPresentation,
} from '@/lib/terminal/activityPresentation';
import { buildActivityTimeline, formatElapsed } from '@/lib/terminal/activityTimeline';
import type { PendingExecutionIntent } from '@/lib/terminal/executionIntent';
import type { TerminalRunState } from '@/lib/terminal/terminalEvent';

/** Nothing new for this long is worth saying out loud, and only as a measured fact. */
const STALLED_AFTER_MS = 9_000;

interface TerminalLiveActivityProps {
  run?: TerminalRunState;
  activity?: readonly XrogaActivityPresentation[];
  pending?: boolean;
  pendingIntent?: PendingExecutionIntent;
  pendingLabel?: string;
  thinkingSteps?: readonly string[];
}

/** Legacy persisted step text becomes settled rows. It is shown as stored; nothing is added to it. */
function rowsFromThinkingSteps(steps: readonly string[]): XrogaActivityPresentation[] {
  return steps
    .map((step, index) => ({ step: publicActivityText(step), index }))
    .filter(({ step }) => step && !isGenericPlaceholderActivity(step))
    .map(({ step, index }) => ({
      id: `legacy-step-${index}`, kind: 'understand' as const, label: step, status: 'complete' as const, startedAt: index, updatedAt: index,
    }));
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
  pendingIntent = 'chat',
  pendingLabel,
  thinkingSteps = [],
}: TerminalLiveActivityProps) {
  const [now, setNow] = useState(() => Date.now());
  const [mountedAt] = useState(() => Date.now());
  const shown = useRef<{ id: string | null; since: number }>({ id: null, since: 0 });

  const rows = useMemo(() => {
    if (activity) return [...activity];
    if (run) return coalesceActivity(run.events);
    return [];
  }, [activity, run]);
  const legacy = useMemo(() => (rows.length === 0 && !pending ? rowsFromThinkingSteps(thinkingSteps) : []), [rows.length, pending, thinkingSteps]);
  const active = Boolean(run?.active || pending);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  const model = useMemo(
    () => buildActivityTimeline(rows.length ? rows : legacy, {
      runActive: active,
      outcome: run?.outcome ?? null,
      displayedActiveId: shown.current.id,
      displayedSince: shown.current.since,
      now,
    }),
    [rows, legacy, active, run?.outcome, now],
  );
  useEffect(() => {
    const id = model.active?.id ?? null;
    if (id !== shown.current.id) shown.current = { id, since: Date.now() };
  });

  const lastObservableAt = rows.length > 0 ? Math.max(...rows.map((row) => row.updatedAt)) : run?.startedAt ?? mountedAt;
  const silentForMs = Math.max(0, now - lastObservableAt);
  const note = active && silentForMs >= STALLED_AFTER_MS && model.state !== 'waiting'
    ? `No new update for ${formatElapsed(silentForMs)} · still working`
    : undefined;

  if (rows.length === 0 && legacy.length === 0 && !pending && !run?.active) return null;

  const label = pendingLabel && !isGenericPlaceholderActivity(pendingLabel) ? pendingLabel : 'Responding';
  const shell = rows.length === 0 && pending;
  return (
    <div
      data-testid="terminal-live-activity"
      data-state={shell ? 'pending' : active ? 'active' : 'settled'}
      data-intent={shell ? pendingIntent : undefined}
    >
      <ActivityTimeline model={model} now={now} runStartedAt={run?.startedAt ?? mountedAt} pendingLabel={label} note={note} />
    </div>
  );
}
