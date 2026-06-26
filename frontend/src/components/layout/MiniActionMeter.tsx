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
      <div className={cn('animate-pulse rounded-lg bg-white/5', compact ? 'h-10' : 'h-16')} />
    );
  }

  const pct = actions.total > 0 ? (actions.remaining / actions.total) * 100 : 0;
  const isLow = pct <= 20;
  const isOut = actions.remaining <= 0;

  const content = (
    <>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Zap className={cn('w-3.5 h-3.5', isOut ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-[var(--accent)]')} />
          <span className="text-xs font-medium font-terminal">Fuel</span>
        </div>
        <span className="text-xs text-[var(--muted)] capitalize">{actions.planTier}</span>
      </div>
      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-lg font-bold">{actions.remaining.toLocaleString()}</span>
        <span className="text-xs text-[var(--muted)]">/ {actions.total.toLocaleString()}</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            isOut ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-gradient-to-r from-[var(--accent)] to-[var(--primary)]'
          )}
          style={{ width: `${Math.max(pct, 3)}%` }}
        />
      </div>
    </>
  );

  const className = cn(
    'rounded-lg glass-panel w-full text-left',
    compact ? 'p-2' : 'p-3',
    onTopUp && 'hover:border-[var(--accent)]/40 transition-colors cursor-pointer'
  );

  if (onTopUp) {
    return (
      <button type="button" onClick={onTopUp} className={className}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
