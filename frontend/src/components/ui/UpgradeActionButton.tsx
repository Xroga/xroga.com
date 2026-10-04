'use client';

import { cn } from '@/lib/utils';

export function UpgradeActionButton({
  className,
  compact = false,
  label = 'Upgrade',
}: {
  className?: string;
  compact?: boolean;
  label?: string;
}) {
  return (
    <span className={cn('xv-upgrade-action', compact && 'xv-upgrade-action--compact', className)}>
      <span className="xv-upgrade-action__fold" aria-hidden="true" />
      <span className="xv-upgrade-action__points" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => <i key={index} />)}
      </span>
      <span className="xv-upgrade-action__inner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" aria-hidden="true">
          <polyline points="13.18 1.37 13.18 9.64 21.45 9.64 10.82 22.63 10.82 14.36 2.55 14.36 13.18 1.37" />
        </svg>
        {label}
      </span>
    </span>
  );
}
