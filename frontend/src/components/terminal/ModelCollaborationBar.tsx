'use client';

import { cn } from '@/lib/utils';

/** Spec-aligned build model passes — DeepSeek Pro/Flash + Claude Sonnet/Opus */
const MODELS = [
  { id: 'pro-arch', name: 'DeepSeek Pro', role: 'Architecture' },
  { id: 'flash', name: 'DeepSeek Flash', role: 'Scaffold' },
  { id: 'pro-logic', name: 'DeepSeek Pro', role: 'Logic' },
  { id: 'sonnet', name: 'Claude Sonnet', role: 'UI/UX' },
  { id: 'opus', name: 'Claude Opus', role: 'Quality' },
  { id: 'pro-sec', name: 'DeepSeek Pro', role: 'Security' },
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

/** Shows which AI models collaborate during a build (NO COMPROMISE spec). */
export function ModelCollaborationBar({ activePhase, loading, className }: ModelCollaborationBarProps) {
  if (!loading) return null;

  const activeIndex = activeIndexFromPhase(activePhase);

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {MODELS.map((m, i) => (
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
          {m.name.replace('DeepSeek ', 'DS ').replace('Claude ', '')} · {m.role}
        </span>
      ))}
      <span className="text-[8px] text-[var(--muted)]/50 self-center">→ DeepSeek fallback if unavailable</span>
    </div>
  );
}
