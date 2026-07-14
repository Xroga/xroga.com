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

/** Map negotiationPhase (0–8) → role chip. Must advance during real builds. */
function activeIndexFromPhase(phase: number | null | undefined): number {
  if (phase == null || phase <= 0) return 0; // Architect · Architecture
  if (phase === 1 || phase === 2) return 0; // plan / structure still Architect
  if (phase === 3) return 1; // Pulse · Scaffold
  if (phase === 4) return 2; // Architect · Logic (verify/fix loop)
  if (phase === 5) return 2; // corrections
  if (phase === 6) return 4; // Collective · Quality (+ Visionary polish before)
  if (phase >= 7) return 5; // BLACK HOLE · Security / deploy
  return 0;
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
