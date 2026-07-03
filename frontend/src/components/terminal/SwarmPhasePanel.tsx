'use client';

import { cn } from '@/lib/utils';

const PHASES = [
  { id: 0, label: 'Discovery' },
  { id: 1, label: 'Planning' },
  { id: 2, label: 'Verify Plan' },
  { id: 3, label: 'Execute' },
  { id: 4, label: 'Verify Code' },
  { id: 5, label: 'Fix Errors' },
  { id: 6, label: 'Final Check' },
  { id: 7, label: 'Emit' },
] as const;

interface SwarmPhasePanelProps {
  activePhase?: number | null;
  loading: boolean;
  message?: string | null;
}

/** Live 7-phase AI Swarm Logic progress — XROGA Black Hole V∞ */
export function SwarmPhasePanel({ activePhase, loading, message }: SwarmPhasePanelProps) {
  if (!loading || activePhase == null) return null;

  const phase = Math.min(7, Math.max(0, activePhase));

  return (
    <div className="my-2 rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] px-3 py-2.5">
      <p className="text-[10px] font-bold tracking-wide text-[#60a5fa]/90 mb-2">
        🕳️ XROGA · BLACK HOLE V∞ · AI SWARM LOGIC
      </p>
      <div className="flex flex-wrap gap-1 mb-2">
        {PHASES.map((p) => {
          const done = p.id < phase;
          const active = p.id === phase;
          return (
            <span
              key={p.id}
              className={cn(
                'text-[9px] px-1.5 py-0.5 rounded-md border transition-colors',
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
      {message && (
        <p className="text-[11px] text-[var(--foreground)]/75 leading-snug line-clamp-3 whitespace-pre-wrap">
          {message.replace(/^🕳️[^\n]*\n\n/, '')}
        </p>
      )}
    </div>
  );
}
