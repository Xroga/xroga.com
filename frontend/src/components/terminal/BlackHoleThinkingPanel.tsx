'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Infinity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { XrogaBlackHoleShineText } from '@/components/ui/XrogaBlackHoleShineText';

export interface BlackHoleThinkingPanelProps {
  steps: string[];
  startedAt?: number;
  thoughtMs?: number;
  active?: boolean;
  defaultExpanded?: boolean;
  className?: string;
}

/** Cursor-style "Thought for Xs" — theme-aware, expandable planning steps */
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
        ? [
            'Understanding your request',
            'XROGA Architect — system design & API plan',
            'Routing through XROGA Black Hole V∞',
            'Composing your project',
          ]
        : ['Processed with XROGA Black Hole V∞'];

  return (
    <div className={cn('space-y-2', className)}>

      <div className={cn('xv-thinking-panel', active && 'xv-thinking-shimmer')}>
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-[var(--accent)]/10 to-transparent opacity-0 xv-thinking-sweep"
          aria-hidden
        />

        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="xv-thinking-panel__header relative z-10"
          aria-expanded={expanded}
        >
          <XrogaBlackHoleShineText className={cn('text-[12px] tracking-tight', active && 'text-[13px]')} as="span">
            {active ? 'XROGA AI Black Hole — processing…' : `Thought for ${seconds}s`}
          </XrogaBlackHoleShineText>
          <span className="flex items-center gap-0.5 text-[10px] font-bold text-[var(--muted)]">
            XROGA Black Hole V
            <Infinity className="h-3 w-3 text-[var(--accent)]" strokeWidth={2.5} />
          </span>
          <ChevronDown
            className={cn(
              'ml-auto h-3.5 w-3.5 text-[var(--muted)] transition-transform duration-200',
              expanded && 'rotate-180'
            )}
          />
        </button>

        {expanded && (
          <div className="xv-thinking-panel__steps relative z-10">
            <ol className="space-y-2">
              {displaySteps.map((step, i) => (
                <li key={`${i}-${step}`} className="flex gap-2.5 text-[12px] leading-snug text-[var(--foreground)]/85">
                  <span className="mt-px shrink-0 font-semibold tabular-nums text-[var(--muted)]">{i + 1}.</span>
                  <span className={cn(active && i === displaySteps.length - 1 && 'xv-swarm-typing font-medium')}>
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
