'use client';

import { Zap, AlertTriangle } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

export function ActionMeterLarge() {
  const actions = useAppStore((s) => s.actions);

  if (!actions) {
    return (
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6">
        <Skeleton height={120} baseColor="#1a1a2e" highlightColor="#2a2a3e" />
      </div>
    );
  }

  const pct = actions.total > 0 ? (actions.remaining / actions.total) * 100 : 0;
  const isLow = pct <= 20;
  const isOut = actions.remaining <= 0;
  const resetIn = formatDistanceToNow(new Date(actions.resetDate), { addSuffix: false });

  return (
    <div
      className={cn(
        'rounded-xl border bg-[var(--card)] p-6',
        isOut ? 'border-red-500/50' : isLow ? 'border-amber-500/50' : 'border-[var(--card-border)]'
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className={cn('w-5 h-5', isOut ? 'text-red-400' : 'text-violet-400')} />
          <h2 className="font-semibold">Action Meter</h2>
        </div>
        <span className="text-xs px-2 py-1 rounded-full bg-violet-500/20 text-violet-300 capitalize">
          {actions.planTier} plan
        </span>
      </div>

      <div className="flex items-end gap-2 mb-4">
        <span className="text-4xl font-bold">{actions.remaining.toLocaleString()}</span>
        <span className="text-[var(--muted)] mb-1">/ {actions.total.toLocaleString()} Actions</span>
      </div>

      <div className="h-3 bg-white/5 rounded-full overflow-hidden mb-3">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-700',
            isOut ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-gradient-to-r from-violet-600 to-cyan-500'
          )}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-[var(--muted)]">
        <span>{pct.toFixed(0)}% remaining</span>
        <span>Resets in {resetIn}</span>
      </div>

      {(isLow || isOut) && (
        <div className={cn('flex items-center gap-2 mt-4 text-sm', isOut ? 'text-red-400' : 'text-amber-400')}>
          <AlertTriangle className="w-4 h-4" />
          {isOut ? 'Out of Actions — top up to continue' : 'Running low — consider upgrading'}
        </div>
      )}
    </div>
  );
}
