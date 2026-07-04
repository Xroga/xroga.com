'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Circle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SwarmTodoItem } from '@/lib/swarm';
import { deriveBuildGoal, formatAgentActivityLine } from '@/lib/agentProcessingFormat';

interface XrogaAgentProcessingPanelProps {
  loading: boolean;
  startedAt?: number | null;
  goal?: string | null;
  activityLog?: string[];
  todos?: SwarmTodoItem[];
  activePhase?: number | null;
  className?: string;
}

/** Cursor-style dark agent log — thoughts, actions, to-dos while building */
export function XrogaAgentProcessingPanel({
  loading,
  startedAt,
  goal,
  activityLog = [],
  todos = [],
  activePhase,
  className,
}: XrogaAgentProcessingPanelProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!loading || !startedAt) return;
    const tick = () => setElapsedMs(Date.now() - startedAt);
    tick();
    const id = setInterval(tick, 400);
    return () => clearInterval(id);
  }, [loading, startedAt]);

  const thoughtSeconds = Math.max(1, Math.round(elapsedMs / 1000));
  const formattedLog = useMemo(
    () =>
      activityLog
        .map(formatAgentActivityLine)
        .filter(Boolean)
        .slice(-12),
    [activityLog]
  );

  const displayGoal = goal ?? deriveBuildGoal(null, formattedLog[formattedLog.length - 1]);
  const doneCount = todos.filter((t) => t.status === 'done').length;
  const activeCount = todos.filter((t) => t.status === 'active').length;

  const phaseLabel =
    activePhase === 0
      ? 'GitHub'
      : activePhase === 1
        ? 'Build'
        : activePhase === 2
          ? 'Verify'
          : activePhase === 4
            ? 'Deploy'
            : activePhase === 5
              ? 'Ready'
              : activePhase === 6
                ? 'Update'
                : null;

  return (
    <div
      className={cn(
        'rounded-xl border border-white/[0.08] bg-[#0c0c0e]/95 backdrop-blur-sm',
        'px-3.5 py-3 space-y-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
        'animate-in fade-in slide-in-from-bottom-1 duration-300',
        className
      )}
    >
      {/* Thought duration — Cursor style */}
      <p className="text-[13px] leading-snug text-[var(--muted)]/90">
        {loading ? (
          <>
            Thought for {thoughtSeconds}s
            <span className="xv-agent-thought-pulse ml-1 inline-block w-1 h-1 rounded-full bg-[var(--muted)]/60 align-middle" />
          </>
        ) : (
          `Thought for ${thoughtSeconds}s`
        )}
      </p>

      {displayGoal && (
        <p className="text-[13px] leading-relaxed text-[var(--foreground)]/88 animate-in fade-in duration-200">
          {displayGoal}
        </p>
      )}

      {phaseLabel && loading && (
        <p className="text-[12px] text-[var(--muted)]/75 xv-agent-line-in">
          Exploring — Phase {phaseLabel}
        </p>
      )}

      {/* Activity stream */}
      {formattedLog.length > 0 && (
        <div className="space-y-1 max-h-[140px] overflow-y-auto pr-1 scrollbar-thin">
          {formattedLog.map((line, i) => (
            <p
              key={`${i}-${line.slice(0, 32)}`}
              className={cn(
                'text-[12px] leading-snug xv-agent-line-in',
                i === formattedLog.length - 1 && loading
                  ? 'text-[var(--foreground)]/85'
                  : 'text-[var(--muted)]/55'
              )}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {line}
            </p>
          ))}
        </div>
      )}

      {/* To-dos box — Cursor style */}
      {todos.length > 0 && (
        <div className="rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2.5 animate-in fade-in duration-300">
          <p className="text-[12px] font-medium text-[var(--foreground)]/75 mb-2">
            To-dos {todos.length}
          </p>
          <ul className="space-y-1.5" aria-label="Build to-dos">
            {todos.map((item) => (
              <li
                key={item.id}
                className={cn(
                  'flex items-start gap-2 text-[12px] leading-snug transition-all duration-200',
                  item.status === 'done' && 'text-[var(--muted)]/50 line-through decoration-[var(--muted)]/30',
                  item.status === 'active' && 'text-[var(--foreground)]/90',
                  item.status === 'pending' && 'text-[var(--muted)]/40'
                )}
              >
                <span className="mt-0.5 shrink-0" aria-hidden>
                  {item.status === 'done' ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500/80" strokeWidth={2.5} />
                  ) : item.status === 'active' ? (
                    <Loader2 className="h-3.5 w-3.5 text-[#60a5fa] animate-spin" strokeWidth={2.5} />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-[var(--muted)]/30" strokeWidth={2} />
                  )}
                </span>
                <span className={cn(item.status === 'active' && 'font-medium')}>
                  {item.label.replace(/^\[Phase \d+\]\s*/i, '')}
                </span>
              </li>
            ))}
          </ul>
          {doneCount > 0 && (
            <p className="mt-2.5 text-[11px] text-[var(--muted)]/60 flex items-center gap-1.5">
              <Check className="h-3 w-3 text-emerald-500/70" strokeWidth={2.5} />
              Completed {doneCount} of {todos.length} to-dos
            </p>
          )}
        </div>
      )}

      {loading && (
        <p className="text-[12px] text-[var(--muted)]/70 xv-agent-planning">
          {activeCount > 0 ? 'Running build pipeline…' : 'Planning next moves…'}
        </p>
      )}
    </div>
  );
}
