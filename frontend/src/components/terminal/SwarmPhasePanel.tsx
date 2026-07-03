'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SwarmTodoItem } from '@/lib/swarm';

interface SwarmPhasePanelProps {
  activePhase?: number | null;
  loading: boolean;
  message?: string | null;
  statusLabel?: string | null;
  analysis?: string | null;
  todos?: SwarmTodoItem[];
}

/** Live XROGA step-by-step planning & build progress */
export function SwarmPhasePanel({
  activePhase,
  loading,
  message,
  statusLabel,
  analysis,
  todos = [],
}: SwarmPhasePanelProps) {
  const showPanel = loading && (todos.length > 0 || activePhase != null);
  if (!showPanel) return null;

  const headline = statusLabel ?? 'XROGA Planning';

  return (
    <div className="my-2 rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] px-3 py-2.5">
      <p className="text-[11px] font-semibold tracking-wide text-[#60a5fa] mb-2">
        🕳️ {headline}
      </p>

      {analysis && (
        <div className="mb-2.5 rounded-lg border border-white/8 bg-black/20 px-2.5 py-2">
          <p className="text-[9px] font-medium uppercase tracking-wider text-[var(--muted)]/70 mb-1">
            Analysis
          </p>
          <p className="text-[11px] text-[var(--foreground)]/80 leading-snug line-clamp-4 whitespace-pre-wrap">
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
                'flex items-start gap-2 rounded-md px-2 py-1.5 text-[11px] leading-snug transition-colors',
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

      {message && !todos.length && (
        <p className="text-[11px] text-[var(--foreground)]/75 leading-snug line-clamp-3 whitespace-pre-wrap">
          {message.replace(/^🕳️[^\n]*\n\n/, '')}
        </p>
      )}
    </div>
  );
}
