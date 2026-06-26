'use client';

import Link from 'next/link';
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
      <div className="glass-panel rounded-xl p-6">
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
        'glass-panel-strong rounded-xl p-6',
        isOut ? 'border-red-500/50' : isLow ? 'border-amber-500/50' : ''
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className={cn('w-5 h-5', isOut ? 'text-red-400' : 'text-[var(--accent)]')} />
          <h2 className="font-semibold font-terminal">Action Meter</h2>
        </div>
        <span className="text-xs px-2 py-1 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] capitalize font-terminal">
          {actions.planTier} plan
        </span>
      </div>

      <div className="flex items-end gap-2 mb-4">
        <span className="text-4xl font-bold">{actions.remaining.toLocaleString()}</span>
        <span className="text-[var(--muted)] mb-1 font-terminal">/ {actions.total.toLocaleString()} actions</span>
      </div>

      <div className="h-3 bg-white/5 rounded-full overflow-hidden mb-3">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-700',
            isOut ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-gradient-to-r from-[var(--accent)] to-[var(--primary)]'
          )}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-[var(--muted)] font-terminal">
        <span>{pct.toFixed(0)}% remaining</span>
        <span>Resets in {resetIn}</span>
      </div>

      {(isLow || isOut) && (
        <div className={cn('flex items-center justify-between mt-4 text-sm', isOut ? 'text-red-400' : 'text-amber-400')}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {isOut ? 'Out of Actions' : 'Running low'}
          </div>
          <Link href="/pricing" className="text-[var(--accent)] hover:underline text-xs">
            Top up →
          </Link>
        </div>
      )}
    </div>
  );
}
