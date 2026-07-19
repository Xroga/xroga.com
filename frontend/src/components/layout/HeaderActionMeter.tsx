'use client';

import { Brain } from 'lucide-react';
import Link from 'next/link';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

interface HeaderTokenMeterProps {
  onClick?: () => void;
  className?: string;
}

export function HeaderTokenMeter({ onClick, className }: HeaderTokenMeterProps) {
  const usage = useAppStore((s) => s.tokenUsage);
  const planTier = useAppStore((s) => s.planTier);
  // null usage = still loading — do NOT flash “0 tokens left”
  const remaining = usage?.totalTokensRemaining;
  const total = usage?.totalLimit ?? 7_000_000;
  const loaded = typeof remaining === 'number';
  const isOut = loaded && remaining <= 0;
  const isLow = loaded && total > 0 && remaining / total <= 0.2;

  const inner = (
    <>
      <div className="xv-token-pill__sheen" aria-hidden />
      <Brain
        className={cn(
          'w-4 h-4 shrink-0 relative z-[1]',
          isOut ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-[#60a5fa]'
        )}
      />
      <div className="relative z-[1] text-left leading-tight">
        <div className={cn('xv-token-pill__plan hidden sm:block', isOut && 'text-red-400')}>
          Plan: {planTier ?? 'trial'}
        </div>
        <div className={cn('xv-token-pill__plan sm:hidden', isOut && 'text-red-400')}>
          {(planTier ?? 'spark').toUpperCase()}
        </div>
        <div className={cn('xv-token-pill__balance tabular-nums hidden sm:block', isOut && 'text-red-400/80')}>
          <span className={cn('font-semibold text-white/90', isOut && 'text-red-400')}>
            {loaded ? formatTokens(remaining) : '—'}
          </span>{' '}
          tokens left
        </div>
        <div className={cn('xv-token-pill__balance tabular-nums sm:hidden', isOut && 'text-red-400/80')}>
          <span className={cn('font-semibold text-white/90', isOut && 'text-red-400')}>
            {loaded ? formatTokens(remaining) : '—'}
          </span>{' '}
          left
        </div>
      </div>
    </>
  );

  const classes = cn(
    'xv-token-pill inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all',
    isOut && 'border-red-500/40',
    className
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {inner}
      </button>
    );
  }

  return (
    <Link href="/dashboard" className={classes}>
      {inner}
    </Link>
  );
}

/** @deprecated Use HeaderTokenMeter */
export const HeaderActionMeter = HeaderTokenMeter;
