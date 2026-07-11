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
import { buildLiveStatusMessage } from '@/lib/buildLiveStatus';
import { AgentActivityRow, AgentTypewriterText } from './AgentTypewriterText';
import { XrogaBlackHoleShineText } from '@/components/ui/XrogaBlackHoleShineText';
import { ProcessingPipeline } from './ProcessingPipeline';
import { ModelCollaborationBar } from './ModelCollaborationBar';

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
          <span className="font-mono text-[11px] text-emerald-500/90 tabular-nums">+{entry.delta}</span>
        )}
      </AgentActivityRow>
    );
  }

  if (entry.kind === 'read' && entry.file) {
    return (
      <AgentActivityRow delayMs={delay} dimmed={!isLast}>
        <span>{entry.label}</span>
        <span className="font-mono text-[11px] text-[var(--foreground)]/75">{entry.file}</span>
        {entry.range && <span className="font-mono text-[11px] text-[var(--muted)]/60">{entry.range}</span>}
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
        <AgentTypewriterText text={entry.label} active={isLast && loading} className="text-[var(--foreground)]/82" />
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

/** Theme-aware agent log — thoughts, to-dos, typed activity feed */
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
  const [liveTick, setLiveTick] = useState(0);

  useEffect(() => {
    if (!loading || !startedAt) return;
    const tick = () => setElapsedMs(Date.now() - startedAt);
    tick();
    const id = setInterval(tick, 400);
    return () => clearInterval(id);
  }, [loading, startedAt]);

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setLiveTick((t) => t + 1), 3500);
    return () => clearInterval(id);
  }, [loading]);

  const thoughtSeconds = Math.max(1, Math.round(elapsedMs / 1000));
  const liveStatus = buildLiveStatusMessage(thoughtSeconds, activePhase, liveTick);
  const formattedLines = useMemo(
    () => activityLog.map(formatAgentActivityLine).filter(Boolean),
    [activityLog]
  );
  const entries = useMemo(() => parseAgentActivityEntries(activityLog), [activityLog]);
  const stats = useMemo(() => computeActivityStats(activityLog, todos), [activityLog, todos]);

  const displayGoal = goal ?? deriveBuildGoal(null, formattedLines[formattedLines.length - 1]);
  const doneCount = todos.filter((t) => t.status === 'done').length;

  const pipelineAgent =
    activePhase === 4 ? 'complete' : activePhase === 2 ? 'reviewer' : activePhase === 1 ? 'builder' : 'architect';

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
        'xv-agent-panel px-3.5 py-3 space-y-2.5 text-left animate-in fade-in slide-in-from-bottom-1 duration-300',
        className
      )}
    >
      {loading && <ProcessingPipeline loading activeAgent={pipelineAgent} />}
      {loading && <ModelCollaborationBar activePhase={activePhase} loading={loading} />}

      <p className="text-[13px] leading-snug text-[var(--muted)] font-medium">
        {thoughtLabel(thoughtSeconds, loading)}
        {loading && (
          <span className="xv-agent-thought-pulse ml-1 inline-block w-1 h-1 rounded-full bg-[var(--accent)]/60 align-middle" />
        )}
      </p>

      {displayGoal && (
        <p className="text-[13px] leading-relaxed text-[var(--foreground)]/88">
          <AgentTypewriterText text={displayGoal} active={loading} />
        </p>
      )}

      {(formattedLines.length > 0 || todos.length > 0) && (
        <p className="text-[12px] text-[var(--muted)]/70 xv-agent-line-in">
          Explored {stats.files} file{stats.files === 1 ? '' : 's'}, {stats.searches} search
          {stats.searches === 1 ? '' : 'es'}
          {stats.commands > 0 ? `, ran ${stats.commands} command${stats.commands === 1 ? '' : 's'}` : ''}
        </p>
      )}

      {todos.length > 0 && (
        <div className="xv-agent-panel__todo px-3 py-2.5 animate-in fade-in duration-300 xv-agent-todo-box">
          <p className="text-[12px] font-medium text-[var(--foreground)]/75 mb-2 flex items-center gap-1.5">
            <ListTodo className="h-3.5 w-3.5 text-[var(--muted)]" strokeWidth={2} />
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
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[var(--accent)]/50 bg-[var(--accent)]/10">
                      <ChevronRight className="h-2.5 w-2.5 text-[var(--accent)]" strokeWidth={2.5} />
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

      {loading && (
        <div className="xv-agent-panel__live px-3 py-2.5 xv-agent-live-pulse">
          <p className="text-[12px] flex items-center gap-2 leading-snug">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-[var(--accent)]" strokeWidth={2.5} />
            <XrogaBlackHoleShineText className="text-[12px]">
              <AgentTypewriterText text={liveStatus} active key={liveStatus} />
            </XrogaBlackHoleShineText>
          </p>
        </div>
      )}

      {entries.length > 0 && (
        <div className="space-y-1 max-h-[280px] overflow-y-auto pr-1 scrollbar-thin border-t border-[var(--card-border)] pt-2">
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
        <p className="text-[11px] text-[var(--muted)]/50 flex items-center gap-2">
          <span className="inline-flex gap-0.5">
            <span className="w-1 h-1 rounded-full bg-[var(--accent)]/60 xv-agent-thought-pulse" />
            <span className="w-1 h-1 rounded-full bg-[var(--accent)]/40 xv-agent-thought-pulse [animation-delay:200ms]" />
            <span className="w-1 h-1 rounded-full bg-[var(--accent)]/25 xv-agent-thought-pulse [animation-delay:400ms]" />
          </span>
          Working — lines above update as each step completes
        </p>
      )}
    </div>
  );
}
