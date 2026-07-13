'use client';

import Link from 'next/link';
import { Brain, AlertTriangle } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

export function ActionMeterLarge() {
  const usage = useAppStore((s) => s.tokenUsage);
  const planName = useAppStore((s) => s.planName);

  if (!usage) {
    return (
      <div className="glass-panel rounded-xl p-6">
        <Skeleton height={120} baseColor="#1a1a2e" highlightColor="#2a2a3e" />
      </div>
    );
  }

  const total = usage.totalLimit ?? usage.totalTokensRemaining + usage.totalTokensUsed;
  const remaining = usage.totalTokensRemaining;
  const pct = total > 0 ? (remaining / total) * 100 : 0;
  const isLow = pct <= 20;
  const isOut = remaining <= 0;

  return (
    <div
      className={cn(
        'glass-panel-strong rounded-xl p-6',
        isOut ? 'border-red-500/50' : isLow ? 'border-amber-500/50' : ''
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className={cn('w-5 h-5', isOut ? 'text-red-400' : 'text-[var(--accent)]')} />
          <h2 className="font-semibold font-terminal">Token Meter</h2>
        </div>
        <span className="text-xs px-2 py-1 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] font-terminal">
          {planName ?? 'Basic'} plan
        </span>
      </div>

      <div className="flex items-end gap-2 mb-4">
        <span className="text-4xl font-bold tabular-nums">{formatTokens(remaining)}</span>
        <span className="text-[var(--muted)] mb-1 font-terminal">/ {formatTokens(total)} tokens</span>
      </div>

      <div className="h-3 bg-white/5 rounded-full overflow-hidden mb-3">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-700',
            isOut ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-gradient-to-r from-[var(--accent)] to-violet-500'
          )}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-[var(--muted)] font-terminal">
        <span>{pct.toFixed(0)}% remaining</span>
        <span>{usage.percentUsed}% used this month</span>
      </div>

      {(isLow || isOut) && (
        <div className={cn('flex items-center justify-between mt-4 text-sm', isOut ? 'text-red-400' : 'text-amber-400')}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {isOut ? 'Out of tokens' : 'Running low'}
          </div>
          <Link href="/dashboard" className="text-[var(--accent)] hover:underline text-xs">
            View usage →
          </Link>
        </div>
      )}
    </div>
  );
}
