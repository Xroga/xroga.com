'use client';

import { useEffect, useMemo, useState } from 'react';

import { ActivityTimeline } from '@/components/activity/ActivityTimeline';
import {
  coalesceActivity,
  type XrogaActivityPresentation,
} from '@/lib/terminal/activityPresentation';
import { buildActivityTimeline, formatElapsed, pendingWorkLabel, type PendingReplyKind } from '@/lib/terminal/activityTimeline';
import type { TerminalRunState } from '@/lib/terminal/terminalEvent';
import { buildProcessingView } from '@/lib/terminal/processingView';
import { buildProcessingStream } from '@/lib/terminal/processingStream';
import { isRoutineTurn } from '@/lib/terminal/clientSteps';
import type { SwarmTodoItem } from '@/lib/swarm';

interface TerminalLiveActivityProps {
  run?: TerminalRunState;
  activity?: readonly XrogaActivityPresentation[];
  pending?: boolean;
  pendingReply?: PendingReplyKind;
  /** Backend plan for the current turn. Shown as a checklist only when it has three or more steps. */
  todos?: readonly SwarmTodoItem[];
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
  pendingReply,
  todos,
}: TerminalLiveActivityProps) {
  const [now, setNow] = useState(() => Date.now());
  const [mountedAt] = useState(() => Date.now());

  const rows = useMemo(() => {
    if (activity) return [...activity];
    if (run) return coalesceActivity(run.events);
    return [];
  }, [activity, run]);
  const active = !run?.outcome && Boolean(run?.active || pending);
  // The surface above the answer follows every real stage report from the backend, including plain status lines
  // that the folded history leaves out (understanding, routing, writing). Generic filler is still dropped.
  const stageRows = useMemo(() => (run ? coalesceActivity(run.events) : []), [run]);
  const stage = active
    ? (stageRows.findLast((row) => row.status === 'active' || row.status === 'waiting') ?? stageRows.at(-1) ?? null)
    : null;

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

  if (rows.length === 0 && !active && !run?.outcome) return null;
  // A plain chat reply keeps no activity above it: the dots while it is written, then only the answer.
  const routine = !todos?.length && isRoutineTurn(stageRows.length > rows.length ? stageRows : rows);
  if (routine && !active && run?.outcome !== 'failure' && run?.outcome !== 'interrupted') return null;

  const baseLabel = pendingWorkLabel(run?.events ?? [], rows.length > 0, pendingReply);
  const label = !model.active && stage && baseLabel !== 'Writing response' ? stage.label : baseLabel;
  // A checklist belongs to a build with its own to-do list. Chat never draws one from ordinary progress rows.
  const processing = active && todos?.length
    ? buildProcessingView({ active: model.active ?? stage, otherActive: model.active ? model.otherActive : 0, rows: stageRows.length > rows.length ? stageRows : rows, pendingLabel: label, todos, outcome: run?.outcome ?? null })
    : undefined;
  const shell = rows.length === 0 && active;
  const fullStream = buildProcessingStream(stageRows.length > rows.length ? stageRows : rows, active);
  const stream = routine ? fullStream.filter(entry => entry.type === 'step' && entry.state === 'live') : fullStream;
  return (
    <div
      data-testid="terminal-live-activity"
      data-state={shell ? 'pending' : active ? 'active' : 'settled'}
    >
      <ActivityTimeline model={model} now={now} runStartedAt={run?.startedAt ?? mountedAt} pendingLabel={label} processing={processing} stream={stream} />
    </div>
  );
}
