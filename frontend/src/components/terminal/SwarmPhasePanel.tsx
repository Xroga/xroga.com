'use client';

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
  buildPrompt?: string;
  peakNudge?: string | null;
}

/** Minimal build progress — no Black Hole / Architect theater header. */
export function SwarmPhasePanel({
  activePhase,
  loading,
  message,
  statusLabel,
  todos = [],
  activityLog = [],
  startedAt,
}: SwarmPhasePanelProps) {
  const showPanel =
    loading && (todos.length > 0 || activePhase != null || Boolean(message) || activityLog.length > 0);
  if (!showPanel) return null;

  const status =
    (statusLabel && statusLabel.trim()) ||
    (message && message.trim()) ||
    null;

  return (
    <div className={cn('my-1')}>
      <XrogaAgentProcessingPanel
        loading={loading}
        startedAt={startedAt}
        status={status}
        activityLog={activityLog.length ? activityLog : message ? [message] : []}
        todos={todos}
      />
    </div>
  );
}
