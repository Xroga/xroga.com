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
  const remaining = usage?.totalTokensRemaining ?? 0;
  const total = usage?.totalLimit ?? 7_000_000;
  const isOut = remaining <= 0;
  const isLow = total > 0 && remaining / total <= 0.2;

  const inner = (
    <>
      <Brain
        className={cn('w-4 h-4', isOut ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-[var(--accent)]')}
      />
      <span className="font-terminal text-sm">
        <span className={cn('font-semibold tabular-nums', isOut && 'text-red-400')}>
          {formatTokens(remaining)}
        </span>
        <span className="text-[var(--muted)] hidden sm:inline"> tokens left</span>
      </span>
    </>
  );

  const classes = cn(
    'inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-panel text-sm transition-all hover:border-[var(--accent)]/40',
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
    <Link href="/dashboard/home" className={classes}>
      {inner}
    </Link>
  );
}

/** @deprecated Use HeaderTokenMeter */
export const HeaderActionMeter = HeaderTokenMeter;
