'use client';

import { cn } from '@/lib/utils';

/** XROGA AI swarm roles — no external provider names in UI */
const XROGA_ROLES = [
  { id: 'architect', name: 'XROGA Architect', role: 'Architecture' },
  { id: 'pulse', name: 'XROGA Pulse', role: 'Scaffold' },
  { id: 'architect-logic', name: 'XROGA Architect', role: 'Logic' },
  { id: 'visionary', name: 'XROGA Visionary', role: 'UI/UX' },
  { id: 'collective', name: 'XROGA Collective', role: 'Quality' },
  { id: 'blackhole', name: 'BLACK HOLE V∞', role: 'Security' },
] as const;

interface ModelCollaborationBarProps {
  activePhase?: number | null;
  loading?: boolean;
  className?: string;
}

function activeIndexFromPhase(phase: number | null | undefined): number {
  if (phase == null || phase <= 1) return 0;
  if (phase === 3) return 2;
  if (phase === 2) return 3;
  if (phase === 4) return 5;
  if (phase === 5) return 5;
  if (phase >= 6) return 4;
  return 1;
}

/** Shows which XROGA AI roles collaborate during a build. */
export function ModelCollaborationBar({ activePhase, loading, className }: ModelCollaborationBarProps) {
  if (!loading) return null;

  const activeIndex = activeIndexFromPhase(activePhase);

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {XROGA_ROLES.map((m, i) => (
        <span
          key={m.id}
          className={cn(
            'text-[8px] px-1.5 py-0.5 rounded-full border font-mono transition-all duration-300',
            i === activeIndex
              ? 'border-[var(--accent)]/50 bg-[var(--accent)]/15 text-[var(--accent)] scale-105'
              : i < activeIndex
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-[var(--card-border)] text-[var(--muted)]/60'
          )}
          title={`${m.name} — ${m.role}`}
        >
          {m.name.replace('XROGA ', '')} · {m.role}
        </span>
      ))}
      <span className="text-[8px] text-[var(--muted)]/50 self-center">→ XROGA reserve if unavailable</span>
    </div>
  );
}
