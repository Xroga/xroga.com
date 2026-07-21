'use client';

import { cn } from '@/lib/utils';

interface BlackHoleLoaderProps {
  /** xs = tiny avatar slot; sm = compact wait */
  size?: 'xs' | 'sm';
  className?: string;
}

/**
 * Compact Black Hole wait spinner (Uiverse StealthWorm, theme-tuned).
 * No orbiting text — silent visual only.
 */
export function BlackHoleLoader({ size = 'xs', className }: BlackHoleLoaderProps) {
  return (
    <div
      className={cn(
        'xv-bh-wrap',
        size === 'xs' ? 'xv-bh-wrap--xs' : 'xv-bh-wrap--sm',
        className
      )}
      role="status"
      aria-label="Processing"
    >
      <div className="xv-bh-loader">
        <div className="xv-bh-blackhole" aria-hidden>
          <div className="xv-bh-circle" />
          <div className="xv-bh-disc" />
        </div>
      </div>
    </div>
  );
}
