'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SwarmTodoItem } from '@/lib/swarm';
import { SwarmProcessingTicker } from './SwarmProcessingTicker';

/** User-visible build phases — Phase 2 planning runs silently on the backend */
const PHASES = [
  { id: 0, label: '0 · GitHub' },
  { id: 1, label: '1 · Discovery' },
  { id: 3, label: '3 · Building' },
  { id: 4, label: '4 · Verifying' },
  { id: 5, label: '5 · Deploy' },
] as const;

interface SwarmPhasePanelProps {
  activePhase?: number | null;
  loading: boolean;
  message?: string | null;
  statusLabel?: string | null;
  analysis?: string | null;
  todos?: SwarmTodoItem[];
  activityLog?: string[];
}

/** Live build progress — Phases 1, 3, 4, 5 (planning hidden) */
export function SwarmPhasePanel({
  activePhase,
  loading,
  message,
  statusLabel,
  analysis,
  todos = [],
  activityLog = [],
}: SwarmPhasePanelProps) {
  const showPanel = loading && (todos.length > 0 || activePhase != null || Boolean(message));
  if (!showPanel) return null;

  const phase = activePhase != null ? activePhase : null;
  const liveText = message ?? statusLabel ?? activityLog[activityLog.length - 1];
  const headline = statusLabel ?? 'AI SWARM LOGIC';

  const phaseIndex = phase != null ? PHASES.findIndex((p) => p.id === phase) : -1;

  return (
    <div className="my-2 rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] px-3 py-2.5 animate-in fade-in duration-200">
      <p className="text-[10px] font-bold tracking-wide text-[#60a5fa]/90 mb-2">
        🕳️ {headline}
      </p>

      <SwarmProcessingTicker text={liveText} activityLog={activityLog} className="mb-2.5" />

      {phase != null && (
        <div className="flex flex-wrap gap-1 mb-2.5">
          {PHASES.map((p, idx) => {
            const done = phaseIndex >= 0 && idx < phaseIndex;
            const active = p.id === phase;
            return (
              <span
                key={p.id}
                className={cn(
                  'text-[9px] px-1.5 py-0.5 rounded-md border transition-all duration-150',
                  done && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
                  active && 'border-[#006aff]/50 bg-[#006aff]/15 text-[#93c5fd] animate-pulse',
                  !done && !active && 'border-white/10 text-[var(--muted)]/50'
                )}
              >
                {p.label}
              </span>
            );
          })}
        </div>
      )}

      {analysis && !analysis.startsWith('Awaiting:') && (
        <div className="mb-2.5 rounded-lg border border-white/8 bg-black/20 px-2.5 py-2">
          <p className="text-[9px] font-medium uppercase tracking-wider text-[var(--muted)]/70 mb-1">
            Brief
          </p>
          <p className="text-[11px] text-[var(--foreground)]/80 leading-snug line-clamp-3 whitespace-pre-wrap">
            {analysis}
          </p>
        </div>
      )}

      {todos.length > 0 ? (
        <ul className="space-y-1" aria-label="XROGA build steps">
          {todos.map((item) => (
            <li
              key={item.id}
              className={cn(
                'flex items-start gap-2 rounded-md px-2 py-1.5 text-[11px] leading-snug transition-colors duration-150',
                item.status === 'done' && 'text-emerald-400',
                item.status === 'active' && 'bg-[#006aff]/12 text-[#93c5fd] border border-[#006aff]/25',
                item.status === 'pending' && 'text-[var(--muted)]/45'
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px]',
                  item.status === 'done' && 'border-emerald-500/50 bg-emerald-500/15 text-emerald-400',
                  item.status === 'active' && 'border-[#006aff]/50 bg-[#006aff]/20 animate-pulse',
                  item.status === 'pending' && 'border-white/10 bg-white/[0.03]'
                )}
                aria-hidden
              >
                {item.status === 'done' ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
              </span>
              <span className={cn(item.status === 'active' && 'font-medium')}>{item.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
