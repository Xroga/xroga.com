'use client';

import { Zap } from 'lucide-react';
import Link from 'next/link';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';

interface HeaderActionMeterProps {
  onClick?: () => void;
  className?: string;
}

export function HeaderActionMeter({ onClick, className }: HeaderActionMeterProps) {
  const actions = useAppStore((s) => s.actions);
  const remaining = actions?.remaining ?? 0;
  const isOut = remaining <= 0;
  const isLow = actions && actions.total > 0 && remaining / actions.total <= 0.2;

  const inner = (
  <>
      <Zap className={cn('w-4 h-4', isOut ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-[var(--accent)]')} />
      <span className="font-terminal text-sm">
        <span className={cn('font-semibold', isOut && 'text-red-400')}>
          {remaining.toLocaleString()}
        </span>
        <span className="text-[var(--muted)] hidden sm:inline"> actions left</span>
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
    <Link href="/pricing" className={classes}>
      {inner}
    </Link>
  );
}
