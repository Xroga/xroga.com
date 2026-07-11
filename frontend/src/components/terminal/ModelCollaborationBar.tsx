'use client';

import { cn } from '@/lib/utils';

const MODELS = [
  { id: 'flash', name: 'DeepSeek Flash', role: 'Workhorse', pct: '80%' },
  { id: 'pro', name: 'DeepSeek Pro', role: 'Architecture', pct: '15%' },
  { id: 'grok', name: 'Grok', role: 'Strategy', pct: '5%' },
  { id: 'sonnet', name: 'Claude Sonnet', role: 'UI/UX', pct: '5%' },
  { id: 'opus', name: 'Claude Opus', role: 'Quality gate', pct: '<1%' },
] as const;

interface ModelCollaborationBarProps {
  activePhase?: number | null;
  loading?: boolean;
  className?: string;
}

/** Shows which AI models collaborate during a build (spec Part 4). */
export function ModelCollaborationBar({ activePhase, loading, className }: ModelCollaborationBarProps) {
  if (!loading) return null;

  const activeIndex =
    activePhase === 0 ? 0 : activePhase === 1 ? 1 : activePhase === 2 ? 2 : activePhase === 4 ? 3 : activePhase === 5 ? 4 : 1;

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {MODELS.map((m, i) => (
        <span
          key={m.id}
          className={cn(
            'text-[8px] px-1.5 py-0.5 rounded-full border font-mono transition-colors',
            i === activeIndex
              ? 'border-[var(--accent)]/50 bg-[var(--accent)]/15 text-[var(--accent)]'
              : i < activeIndex
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-[var(--card-border)] text-[var(--muted)]/60'
          )}
          title={`${m.name} — ${m.role} (${m.pct})`}
        >
          {m.name.split(' ')[0]} · {m.role}
        </span>
      ))}
    </div>
  );
}
