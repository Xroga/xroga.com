'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
import { buildLiveStatusMessage, isKeepaliveActivity } from '@/lib/buildLiveStatus';
import { AgentActivityRow, AgentTypewriterText } from './AgentTypewriterText';
import { XrogaBlackHoleShineText } from '@/components/ui/XrogaBlackHoleShineText';
import { ModelCollaborationBar } from './ModelCollaborationBar';
import { BuildPatienceBanner } from './BuildPatienceBanner';
import { BuildTodoList } from './BuildTodoList';
import { requestBuildNotificationPermission } from '@/lib/buildBrowserNotify';
import { getDeepSeekPeakStatus } from '@/lib/deepseekPeakHours';

interface XrogaAgentProcessingPanelProps {
  loading: boolean;
  startedAt?: number | null;
  goal?: string | null;
  activityLog?: string[];
  todos?: SwarmTodoItem[];
  activePhase?: number | null;
  buildPrompt?: string;
  className?: string;
  peakNudge?: string | null;
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

/** Theme-aware agent log — real todos + real activity only (no fake rotating polish). */
export function XrogaAgentProcessingPanel({
  loading,
  startedAt,
  goal,
  activityLog = [],
  todos = [],
  activePhase,
  buildPrompt,
  className,
  peakNudge,
}: XrogaAgentProcessingPanelProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const softPeak = peakNudge ?? (loading ? getDeepSeekPeakStatus().nudge : null);

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
  const lastRealActivity = useMemo(() => {
    for (let i = formattedLines.length - 1; i >= 0; i--) {
      const line = formattedLines[i]!;
      if (!isKeepaliveActivity(line)) return line;
    }
    return null;
  }, [formattedLines]);

  const liveStatus = buildLiveStatusMessage(thoughtSeconds, lastRealActivity);
  const entries = useMemo(
    () => parseAgentActivityEntries(activityLog, buildPrompt),
    [activityLog, buildPrompt]
  );
  const stats = useMemo(
    () => computeActivityStats(activityLog, todos, buildPrompt),
    [activityLog, todos, buildPrompt]
  );

  const displayGoal = goal ?? deriveBuildGoal(null, lastRealActivity);

  return (
    <div
      className={cn(
        'xv-agent-panel px-3.5 py-3 space-y-2.5 text-left animate-in fade-in slide-in-from-bottom-1 duration-300',
        className
      )}
    >
      {loading && <ModelCollaborationBar activePhase={activePhase} loading={loading} />}

      {todos.length > 0 && (
        <BuildTodoList todos={todos} showProgress={loading} />
      )}

      {softPeak && loading && (
        <p className="text-[11px] leading-relaxed text-[var(--foreground)]/75 rounded-lg border border-[var(--card-border)]/50 bg-[var(--card)]/60 px-2.5 py-2">
          {softPeak}
        </p>
      )}

      <p className="text-[13px] leading-snug text-[var(--muted)] font-medium">
        {thoughtLabel(thoughtSeconds, loading)}
        {loading && (
          <span className="xv-agent-thought-pulse ml-1 inline-block w-1 h-1 rounded-full bg-[var(--accent)]/60 align-middle" />
        )}
      </p>

      {displayGoal && (
        <p className="text-[13px] leading-relaxed text-[var(--foreground)]/88">
          {displayGoal}
        </p>
      )}

      {loading && (
        <BuildPatienceBanner
          elapsedSeconds={thoughtSeconds}
          onEnableNotifications={() => void requestBuildNotificationPermission()}
        />
      )}

      {/* Only show file/check counts from real write/deploy lines — never invented */}
      {stats.files > 0 && (
        <p className="text-[12px] text-[var(--muted)]/70 xv-agent-line-in">
          Updated {stats.files} file{stats.files === 1 ? '' : 's'}
          {stats.commands > 0
            ? `, ran ${stats.commands} command${stats.commands === 1 ? '' : 's'}`
            : ''}
        </p>
      )}

      {loading && (
        <div className="xv-agent-panel__live px-3 py-2.5">
          <p className="text-[12px] flex items-center gap-2 leading-snug">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-[var(--accent)]" strokeWidth={2.5} />
            <XrogaBlackHoleShineText className="text-[12px]">
              {liveStatus}
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

      {loading && (
        <p className="text-[11px] text-[var(--muted)]/50">
          Real API work in progress — if this stalls with no new to-dos, we auto-stop to protect your credits.
        </p>
      )}
    </div>
  );
}
