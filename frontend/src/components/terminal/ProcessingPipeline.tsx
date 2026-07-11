'use client';

import { cn } from '@/lib/utils';

const FULL_STEPS = [
  { id: 'plan', label: 'Planning' },
  { id: 'build', label: 'Building' },
  { id: 'verify', label: 'Verifying' },
] as const;

const AGENT_STEP: Record<string, number> = {
  routing: 0,
  architect: 0,
  builder: 1,
  reviewer: 2,
  qa: 3,
  debugger: 4,
  automation: 5,
  truth_council: 5,
  complete: 5,
};

interface ProcessingPipelineProps {
  activeAgent?: string | null;
  loading: boolean;
  compact?: boolean;
}

export function ProcessingPipeline({ activeAgent, loading, compact }: ProcessingPipelineProps) {
  if (!loading) return null;

  if (compact) {
    return (
      <div className="xv-thinking-bar flex items-center gap-2.5 py-2.5 px-3 my-2 rounded-lg">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent)]/40" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent)]" />
        </span>
        <span className="text-[13px] text-[var(--foreground)]/80 font-medium">Thinking</span>
        <span className="xv-thinking-dots text-[var(--muted)] text-sm" aria-hidden />
      </div>
    );
  }

  const step = activeAgent ? (AGENT_STEP[activeAgent] ?? 0) : 0;

  return (
    <div className="xv-processing-pipeline">
      <div className="flex items-center gap-3">
        {FULL_STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <div key={s.id} className="flex items-center gap-1.5 flex-1 min-w-0">
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-300',
                  done && 'bg-emerald-500',
                  active && 'bg-[var(--accent)] animate-pulse scale-125',
                  !done && !active && 'bg-[var(--foreground)]/20'
                )}
              />
              <span
                className={cn(
                  'text-[11px] truncate transition-colors',
                  active && 'text-[var(--foreground)] font-medium',
                  done && 'text-[var(--muted)]',
                  !done && !active && 'text-[var(--muted)]/40'
                )}
              >
                {s.label}
              </span>
              {i < FULL_STEPS.length - 1 && (
                <span className="flex-1 h-px bg-white/[0.06] mx-1 hidden sm:block" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
