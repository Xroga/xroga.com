'use client';

import { Infinity } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SwarmTodoItem } from '@/lib/swarm';
import { XrogaAgentProcessingPanel } from './XrogaAgentProcessingPanel';

interface SwarmPhasePanelProps {
  activePhase?: number | null;
  loading: boolean;
  message?: string | null;
  statusLabel?: string | null;
  analysis?: string | null;
  todos?: SwarmTodoItem[];
  activityLog?: string[];
  startedAt?: number | null;
}

/** Build pipeline — Cursor-style agent processing panel */
export function SwarmPhasePanel({
  activePhase,
  loading,
  message,
  analysis,
  todos = [],
  activityLog = [],
  startedAt,
}: SwarmPhasePanelProps) {
  const showPanel =
    loading && (todos.length > 0 || activePhase != null || Boolean(message) || activityLog.length > 0);
  if (!showPanel) return null;

  const goal = analysis && !analysis.startsWith('Awaiting:') ? analysis.slice(0, 220) : null;

  return (
    <div className={cn('my-1')}>
      <p className="text-[10px] font-bold tracking-wide text-[#60a5fa]/90 mb-1.5 px-0.5 flex items-center gap-1 flex-wrap">
        <span>🕳️ AI SWARM LOGIC — BLACK HOLE V</span>
        <Infinity className="h-3 w-3 text-[#006aff]" strokeWidth={2.5} />
      </p>
      <XrogaAgentProcessingPanel
        loading={loading}
        startedAt={startedAt}
        goal={goal ?? message}
        activityLog={activityLog.length ? activityLog : message ? [message] : []}
        todos={todos}
        activePhase={activePhase}
      />
    </div>
  );
}
