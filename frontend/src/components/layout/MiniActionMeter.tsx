'use client';

import { Zap, Sparkles } from 'lucide-react';
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
      <div className={cn('animate-pulse rounded-xl bg-white/5', compact ? 'h-10' : 'h-16')} />
    );
  }

  const pct = actions.total > 0 ? (actions.remaining / actions.total) * 100 : 0;
  const isLow = pct <= 20;
  const isOut = actions.remaining <= 0;

  const content = (
    <div className="xv-fuel-meter relative overflow-hidden rounded-xl">
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/10 via-transparent to-[var(--primary)]/5 pointer-events-none" />
      <div className="relative">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <Zap
                className={cn(
                  'w-4 h-4',
                  isOut ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-[var(--accent)]'
                )}
              />
              {!isOut && <Sparkles className="w-2 h-2 text-[var(--accent)] absolute -top-1 -right-1 animate-pulse" />}
            </div>
            <span className="text-xs font-semibold font-terminal tracking-wide">Fuel</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 capitalize font-medium">
            {actions.planTier}
          </span>
        </div>
        <div className="flex items-baseline gap-1 mb-2">
          <span className="text-xl font-bold tabular-nums">{actions.remaining.toLocaleString()}</span>
          <span className="text-xs text-[var(--muted)]">/ {actions.total.toLocaleString()}</span>
        </div>
        <div className="h-2 bg-black/20 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500 xv-fuel-bar',
              isOut ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-gradient-to-r from-[var(--accent)] to-[var(--primary)]'
            )}
            style={{ width: `${Math.max(pct, 4)}%` }}
          />
        </div>
      </div>
    </div>
  );

  const className = cn(
    'w-full text-left border border-[var(--card-border)]/50',
    compact ? 'p-2' : 'p-3',
    onTopUp && 'hover:border-[var(--accent)]/50 transition-all cursor-pointer'
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
