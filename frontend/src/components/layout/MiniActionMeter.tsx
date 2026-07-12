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

  const inLimit =
    usage.inputTokensRemaining + usage.inputTokensUsed || Math.floor(total * 0.67);
  const outLimit =
    usage.outputTokensRemaining + usage.outputTokensUsed || total - Math.floor(total * 0.67);
  const inRem = usage.inputTokensRemaining;
  const outRem = usage.outputTokensRemaining;
  const inPct = inLimit > 0 ? (inRem / inLimit) * 100 : 0;
  const outPct = outLimit > 0 ? (outRem / outLimit) * 100 : 0;

  const content = (
    <div className="xv-fuel-compact space-y-1">
      <div className="flex items-center justify-between gap-2">
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
        <span className="text-[8px] uppercase tracking-wider text-[var(--muted)] shrink-0">tokens</span>
      </div>
      <div className="h-1 rounded-full bg-white/10 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            isOut ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-gradient-to-r from-[var(--accent)] to-violet-500'
          )}
          style={{ width: `${Math.max(pct, 3)}%` }}
        />
      </div>
      {!compact && (
        <div className="grid grid-cols-2 gap-1.5 text-[8px] text-[var(--muted)]">
          <div>
            <span className="font-semibold text-[var(--foreground)]/80">In</span>{' '}
            {formatTokens(inRem)}/{formatTokens(inLimit)}
            <div className="mt-0.5 h-0.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-cyan-500/70 rounded-full" style={{ width: `${Math.max(inPct, 4)}%` }} />
            </div>
          </div>
          <div>
            <span className="font-semibold text-[var(--foreground)]/80">Out</span>{' '}
            {formatTokens(outRem)}/{formatTokens(outLimit)}
            <div className="mt-0.5 h-0.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-violet-500/70 rounded-full" style={{ width: `${Math.max(outPct, 4)}%` }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const className = cn(
    'w-full text-left rounded-lg bg-white/[0.02] xv-action-meter border border-[var(--card-border)]/40',
    compact ? 'px-2 py-1.5' : 'px-2.5 py-2',
    onUsageClick && 'hover:border-[var(--accent)]/40 transition-colors cursor-pointer'
  );

  if (onUsageClick) {
    return (
      <button type="button" onClick={onUsageClick} className={className} title="View token usage (input + output pools)">
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

/** @deprecated Use MiniTokenMeter */
export const MiniActionMeter = MiniTokenMeter;
