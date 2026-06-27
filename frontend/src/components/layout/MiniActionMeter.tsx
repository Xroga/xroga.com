'use client';

import { Zap } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';

interface MiniActionMeterProps {
  compact?: boolean;
  onTopUp?: () => void;
}

export function MiniActionMeter({ compact = false, onTopUp }: MiniActionMeterProps) {
  const actions = useAppStore((s) => s.actions);

  if (!actions) {
    return (
      <div className={cn('xv-fuel-skeleton animate-pulse rounded-lg bg-white/5', compact ? 'h-8' : 'h-10')} />
    );
  }

  const pct = actions.total > 0 ? (actions.remaining / actions.total) * 100 : 0;
  const isLow = pct <= 20;
  const isOut = actions.remaining <= 0;

  const content = (
    <div className="xv-fuel-compact">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1 min-w-0">
          <Zap
            className={cn(
              'w-3 h-3 shrink-0',
              isOut ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-[var(--accent)]'
            )}
          />
          <span className="text-[10px] font-semibold tabular-nums truncate">
            {actions.remaining.toLocaleString()}
            <span className="text-[var(--muted)] font-normal"> / {actions.total.toLocaleString()}</span>
          </span>
        </div>
        <span className="text-[8px] uppercase tracking-wider text-[var(--muted)] capitalize shrink-0">
          {actions.planTier}
        </span>
      </div>
      <div className="h-1 rounded-full bg-white/10 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            isOut ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-gradient-to-r from-[var(--accent)] to-[var(--primary)]'
          )}
          style={{ width: `${Math.max(pct, 3)}%` }}
        />
      </div>
    </div>
  );

  const className = cn(
    'w-full text-left rounded-lg border border-[var(--card-border)]/40 bg-white/[0.02]',
    compact ? 'px-2 py-1.5' : 'px-2.5 py-2',
    onTopUp && 'hover:border-[var(--accent)]/40 transition-colors cursor-pointer'
  );

  if (onTopUp) {
    return (
      <button type="button" onClick={onTopUp} className={className} title="Top up actions">
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
