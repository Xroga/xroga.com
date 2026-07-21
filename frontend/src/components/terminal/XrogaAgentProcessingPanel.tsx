'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SwarmTodoItem } from '@/lib/swarm';
import { isKeepaliveActivity } from '@/lib/buildLiveStatus';
import { BuildTodoList } from './BuildTodoList';

interface XrogaAgentProcessingPanelProps {
  loading: boolean;
  startedAt?: number | null;
  /** Latest real SSE status line (not rewritten marketing copy). */
  status?: string | null;
  activityLog?: string[];
  todos?: SwarmTodoItem[];
  className?: string;
}

/**
 * Minimal build progress — only real SSE status + advancing to-dos.
 * No Architect theater, thought counters, or typewriter fake progress.
 */
export function XrogaAgentProcessingPanel({
  loading,
  startedAt,
  status,
  activityLog = [],
  todos = [],
  className,
}: XrogaAgentProcessingPanelProps) {
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!loading || !startedAt) return;
    const tick = () => setElapsedSec(Math.max(0, Math.round((Date.now() - startedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [loading, startedAt]);

  const lastReal = useMemo(() => {
    for (let i = activityLog.length - 1; i >= 0; i--) {
      const line = activityLog[i]?.trim();
      if (line && !isKeepaliveActivity(line)) return line;
    }
    return null;
  }, [activityLog]);

  const statusLine = (status?.trim() && !isKeepaliveActivity(status)
    ? status.trim()
    : lastReal) || (loading ? 'Waiting on model…' : 'Done');

  const activeTodo = todos.find((t) => t.status === 'active');
  const doneCount = todos.filter((t) => t.status === 'done').length;

  return (
    <div
      className={cn(
        'rounded-lg border border-[var(--card-border)] bg-[var(--card)]/40 px-3.5 py-3 space-y-2.5 text-left',
        className
      )}
    >
      {loading && (
        <p className="text-[13px] font-medium text-[var(--foreground)] flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-[var(--accent)]" strokeWidth={2.5} />
          Building…
          {elapsedSec > 0 ? (
            <span className="text-[11px] font-normal text-[var(--muted)] tabular-nums">{elapsedSec}s</span>
          ) : null}
        </p>
      )}

      <p className="text-[12px] text-[var(--foreground)]/80 font-mono leading-snug">{statusLine}</p>

      {activeTodo ? (
        <p className="text-[11px] text-[var(--muted)]">
          Step: {activeTodo.label}
          {todos.length > 0 ? ` · ${doneCount}/${todos.length}` : ''}
        </p>
      ) : null}

      {todos.length > 0 && (
        <BuildTodoList todos={todos} showProgress={loading} />
      )}

      {loading && (
        <p className="text-[11px] text-[var(--muted)]/60">
          Press <strong className="font-semibold">Stop</strong> if this status never changes. Waiting
          time is not billed — only completed model calls are.
        </p>
      )}
    </div>
  );
}
