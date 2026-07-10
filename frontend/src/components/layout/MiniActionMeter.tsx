'use client';

import { Brain } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

interface MiniTokenMeterProps {
  compact?: boolean;
  onUsageClick?: () => void;
}

export function MiniTokenMeter({ compact = false, onUsageClick }: MiniTokenMeterProps) {
  const usage = useAppStore((s) => s.tokenUsage);

  if (!usage) {
    return (
      <div className={cn('xv-fuel-skeleton animate-pulse rounded-lg bg-white/5', compact ? 'h-8' : 'h-10')} />
    );
  }

  const total = usage.totalLimit ?? usage.totalTokensRemaining + usage.totalTokensUsed;
  const remaining = usage.totalTokensRemaining;
  const pct = total > 0 ? (remaining / total) * 100 : 0;
  const isLow = pct <= 20;
  const isOut = remaining <= 0;

  const content = (
    <div className="xv-fuel-compact">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1 min-w-0">
          <Brain
            className={cn(
              'w-3 h-3 shrink-0',
              isOut ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-[var(--accent)]'
            )}
          />
          <span className="text-[10px] font-semibold tabular-nums truncate">
            {formatTokens(remaining)}
            <span className="text-[var(--muted)] font-normal"> / {formatTokens(total)}</span>
          </span>
        </div>
        <span className="text-[8px] uppercase tracking-wider text-[var(--muted)] shrink-0">
          tokens
        </span>
      </div>
      <div className="h-1 rounded-full bg-white/10 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            isOut
              ? 'bg-red-500'
              : isLow
                ? 'bg-amber-500'
                : 'bg-gradient-to-r from-[var(--accent)] to-violet-500'
          )}
          style={{ width: `${Math.max(pct, 3)}%` }}
        />
      </div>
    </div>
  );

  const className = cn(
    'w-full text-left rounded-lg bg-white/[0.02] xv-action-meter border border-[var(--card-border)]/40',
    compact ? 'px-2 py-1.5' : 'px-2.5 py-2',
    onUsageClick && 'hover:border-[var(--accent)]/40 transition-colors cursor-pointer'
  );

  if (onUsageClick) {
    return (
      <button type="button" onClick={onUsageClick} className={className} title="View token usage">
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

/** @deprecated Use MiniTokenMeter — kept as alias for gradual migration */
export const MiniActionMeter = MiniTokenMeter;
