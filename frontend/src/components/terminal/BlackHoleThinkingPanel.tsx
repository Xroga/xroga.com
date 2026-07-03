'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Infinity } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BlackHoleThinkingPanelProps {
  steps: string[];
  startedAt?: number;
  thoughtMs?: number;
  active?: boolean;
  defaultExpanded?: boolean;
  className?: string;
}

/** Cursor-style "Thought for Xs" — white / silver / gradient, expandable reasoning steps */
export function BlackHoleThinkingPanel({
  steps,
  startedAt,
  thoughtMs,
  active = false,
  defaultExpanded,
  className,
}: BlackHoleThinkingPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? active);
  const [elapsed, setElapsed] = useState(thoughtMs ?? 0);

  useEffect(() => {
    if (!active || !startedAt) return;
    const tick = () => setElapsed(Date.now() - startedAt);
    tick();
    const t = setInterval(tick, 400);
    return () => clearInterval(t);
  }, [active, startedAt]);

  const seconds = Math.max(1, Math.round((thoughtMs ?? elapsed) / 1000));
  const displaySteps =
    steps.length > 0
      ? steps
      : active
        ? ['Reading your question', 'Routing through XROGA Black Hole V∞', 'Composing answer']
        : ['Processed with XROGA Black Hole V∞'];

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border',
        'border-white/60 bg-gradient-to-br from-white/95 via-slate-50/90 to-slate-100/80',
        'shadow-[0_4px_24px_rgba(148,163,184,0.18)] backdrop-blur-md',
        'dark:from-white/12 dark:via-slate-400/8 dark:to-slate-500/10 dark:border-white/15',
        active && 'xv-thinking-shimmer',
        className
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 xv-thinking-sweep"
        aria-hidden
      />

      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="relative z-10 flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-white/30 dark:hover:bg-white/5"
        aria-expanded={expanded}
      >
        <span
          className={cn(
            'text-[12px] font-semibold tracking-tight',
            'bg-gradient-to-r from-slate-700 via-slate-500 to-[#006aff] bg-clip-text text-transparent',
            'dark:from-slate-200 dark:via-slate-300 dark:to-blue-300'
          )}
        >
          {active ? 'Thinking…' : `Thought for ${seconds}s`}
        </span>
        <span className="flex items-center gap-0.5 text-[10px] font-bold text-slate-500/90 dark:text-slate-400">
          XROGA Black Hole V
          <Infinity className="h-3 w-3 text-[#006aff]" strokeWidth={2.5} />
        </span>
        <ChevronDown
          className={cn(
            'ml-auto h-3.5 w-3.5 text-slate-400 transition-transform duration-200',
            expanded && 'rotate-180'
          )}
        />
      </button>

      {expanded && (
        <div className="relative z-10 border-t border-white/50 px-3.5 py-2.5 dark:border-white/10">
          <ol className="space-y-2">
            {displaySteps.map((step, i) => (
              <li key={`${i}-${step}`} className="flex gap-2.5 text-[12px] leading-snug text-slate-600 dark:text-slate-300">
                <span className="mt-px shrink-0 font-semibold tabular-nums text-slate-400 dark:text-slate-500">
                  {i + 1}.
                </span>
                <span className={cn(active && i === displaySteps.length - 1 && 'xv-swarm-typing')}>
                  {step}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
