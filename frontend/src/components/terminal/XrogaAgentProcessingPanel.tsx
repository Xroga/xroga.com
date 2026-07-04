'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, CircleDashed, ListTodo, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SwarmTodoItem } from '@/lib/swarm';
import {
  computeActivityStats,
  deriveBuildGoal,
  formatAgentActivityLine,
  parseAgentActivityEntries,
  thoughtLabel,
  type AgentActivityEntry,
} from '@/lib/agentProcessingFormat';
import { AgentActivityRow, AgentTypewriterText } from './AgentTypewriterText';

interface XrogaAgentProcessingPanelProps {
  loading: boolean;
  startedAt?: number | null;
  goal?: string | null;
  activityLog?: string[];
  todos?: SwarmTodoItem[];
  activePhase?: number | null;
  className?: string;
}

function ActivityEntryView({ entry, index, isLast, loading }: { entry: AgentActivityEntry; index: number; isLast: boolean; loading: boolean }) {
  const delay = index * 35;

  if (entry.kind === 'status') {
    return (
      <AgentActivityRow delayMs={delay} dimmed={!isLast}>
        <span className="text-[var(--foreground)]/75">{entry.label}</span>
      </AgentActivityRow>
    );
  }

  if (entry.kind === 'edit' && entry.file) {
    return (
      <AgentActivityRow delayMs={delay} dimmed={!isLast && !loading}>
        <span>{entry.label}</span>
        <span className="font-mono text-[11px] text-[var(--foreground)]/80">{entry.file}</span>
        {entry.delta != null && (
          <span className="font-mono text-[11px] text-emerald-400/90 tabular-nums">+{entry.delta}</span>
        )}
      </AgentActivityRow>
    );
  }

  if (entry.kind === 'read' && entry.file) {
    return (
      <AgentActivityRow delayMs={delay} dimmed={!isLast}>
        <span>{entry.label}</span>
        <span className="font-mono text-[11px] text-[var(--foreground)]/75">{entry.file}</span>
        {entry.range && (
          <span className="font-mono text-[11px] text-[var(--muted)]/60">{entry.range}</span>
        )}
      </AgentActivityRow>
    );
  }

  if (entry.kind === 'grep' && entry.file) {
    return (
      <AgentActivityRow delayMs={delay} dimmed={!isLast}>
        <span>{entry.label}</span>
        <span className="font-mono text-[11px] text-[var(--foreground)]/75">{entry.file}</span>
      </AgentActivityRow>
    );
  }

  if (entry.kind === 'explore') {
    return (
      <AgentActivityRow delayMs={delay} dimmed={!isLast}>
        <span className="text-[var(--foreground)]/70">{entry.label}</span>
      </AgentActivityRow>
    );
  }

  if (entry.kind === 'command') {
    return (
      <AgentActivityRow delayMs={delay}>
        <AgentTypewriterText
          text={entry.label}
          active={isLast && loading}
          className="text-[var(--foreground)]/82"
        />
      </AgentActivityRow>
    );
  }

  return (
    <AgentActivityRow delayMs={delay} dimmed={!isLast && !loading}>
      <AgentTypewriterText
        text={entry.label}
        active={isLast && loading && entry.kind === 'text'}
        className={isLast && loading ? 'text-[var(--foreground)]/85' : undefined}
      />
    </AgentActivityRow>
  );
}

/** Cursor-style dark agent log — thoughts, to-dos, typed activity feed */
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
  const formattedLines = useMemo(
    () => activityLog.map(formatAgentActivityLine).filter(Boolean),
    [activityLog]
  );
  const entries = useMemo(() => parseAgentActivityEntries(activityLog), [activityLog]);
  const stats = useMemo(() => computeActivityStats(activityLog, todos), [activityLog, todos]);

  const displayGoal = goal ?? deriveBuildGoal(null, formattedLines[formattedLines.length - 1]);
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
      <p className="text-[13px] leading-snug text-[var(--muted)]/90 font-medium">
        {thoughtLabel(thoughtSeconds, loading)}
        {loading && (
          <span className="xv-agent-thought-pulse ml-1 inline-block w-1 h-1 rounded-full bg-[var(--muted)]/60 align-middle" />
        )}
      </p>

      {displayGoal && (
        <p className="text-[13px] leading-relaxed text-[var(--foreground)]/88">
          <AgentTypewriterText text={displayGoal} active={loading} />
        </p>
      )}

      {(formattedLines.length > 0 || todos.length > 0) && (
        <p className="text-[12px] text-[var(--muted)]/55 xv-agent-line-in">
          Explored {stats.files} file{stats.files === 1 ? '' : 's'}, {stats.searches} search
          {stats.searches === 1 ? '' : 'es'}
          {stats.commands > 0 ? `, ran ${stats.commands} command${stats.commands === 1 ? '' : 's'}` : ''}
        </p>
      )}

      {todos.length > 0 && (
        <div className="rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2.5 animate-in fade-in duration-300 xv-agent-todo-box">
          <p className="text-[12px] font-medium text-[var(--foreground)]/75 mb-2 flex items-center gap-1.5">
            <ListTodo className="h-3.5 w-3.5 text-[var(--muted)]/60" strokeWidth={2} />
            To-dos {todos.length}
          </p>
          <ul className="space-y-1.5" aria-label="Build to-dos">
            {todos.map((item) => (
              <li
                key={item.id}
                className={cn(
                  'flex items-start gap-2 text-[12px] leading-snug transition-all duration-300',
                  item.status === 'done' && 'text-[var(--muted)]/45 line-through decoration-[var(--muted)]/25',
                  item.status === 'active' && 'text-[var(--foreground)]/92 xv-agent-todo-active',
                  item.status === 'pending' && 'text-[var(--muted)]/38'
                )}
              >
                <span className="mt-0.5 shrink-0" aria-hidden>
                  {item.status === 'done' ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500/75" strokeWidth={2.5} />
                  ) : item.status === 'active' ? (
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#60a5fa]/50 bg-[#60a5fa]/10">
                      <ChevronRight className="h-2.5 w-2.5 text-[#60a5fa]" strokeWidth={2.5} />
                    </span>
                  ) : (
                    <CircleDashed className="h-3.5 w-3.5 text-[var(--muted)]/28" strokeWidth={2} />
                  )}
                </span>
                <span className={cn(item.status === 'active' && 'font-medium')}>
                  {item.label.replace(/^\[Phase \d+\]\s*/i, '')}
                </span>
              </li>
            ))}
          </ul>
          {doneCount > 0 && (
            <p className="mt-2.5 text-[11px] text-[var(--muted)]/55 flex items-center gap-1.5 xv-agent-line-in">
              <Check className="h-3 w-3 text-emerald-500/65" strokeWidth={2.5} />
              Completed {doneCount} of {todos.length} to-dos
            </p>
          )}
        </div>
      )}

      {entries.length > 0 && (
        <div className="space-y-1 max-h-[160px] overflow-y-auto pr-1 scrollbar-thin border-t border-white/[0.06] pt-2">
          {entries.map((entry, i) => (
            <ActivityEntryView
              key={entry.id}
              entry={entry}
              index={i}
              isLast={i === entries.length - 1}
              loading={loading}
            />
          ))}
        </div>
      )}

      {phaseLabel && loading && (
        <p className="text-[11px] text-[var(--muted)]/45 font-mono xv-agent-line-in">
          Phase {phaseLabel}
        </p>
      )}

      {loading && (
        <p className="text-[12px] text-[var(--muted)]/65 xv-agent-planning flex items-center gap-2">
          {activeCount > 0 ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-[#60a5fa]/70" strokeWidth={2.5} />
              Running build pipeline…
            </>
          ) : (
            'Planning next moves…'
          )}
        </p>
      )}
    </div>
  );
}
