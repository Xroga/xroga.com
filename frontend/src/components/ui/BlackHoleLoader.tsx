'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';
import { XROGA_MODEL_NAME, XROGA_MODEL_VERSION } from '@/lib/brand';

/** Orbiting label — Black Hole V∞ */
const ORBIT_LABEL = `${XROGA_MODEL_NAME} ${XROGA_MODEL_VERSION}`;

interface BlackHoleLoaderProps {
  /** sm ≈ avatar slot; md ≈ inline wait focal */
  size?: 'sm' | 'md';
  className?: string;
  /** Override orbiting text (default Black Hole V∞) */
  label?: string;
}

/**
 * Compact Black Hole V∞ wait spinner (Uiverse StealthWorm, theme-tuned).
 * Replaces the spinning avatar logo while chat / research / builds wait.
 */
export function BlackHoleLoader({
  size = 'sm',
  className,
  label = ORBIT_LABEL,
}: BlackHoleLoaderProps) {
  const rawId = useId().replace(/:/g, '');
  const pathId = `xv-bh-loading-${rawId}`;

  return (
    <div
      className={cn('xv-bh-wrap', size === 'sm' ? 'xv-bh-wrap--sm' : 'xv-bh-wrap--md', className)}
      role="status"
      aria-label={label}
    >
      <div className="xv-bh-loader">
        <div className="xv-bh-blackhole" aria-hidden>
          <div className="xv-bh-circle" />
          <div className="xv-bh-disc" />
        </div>

        <div className="xv-bh-curve" aria-hidden>
          <svg viewBox="0 0 500 500">
            <path
              id={pathId}
              d="M73.2,148.6c4-6.1,65.5-96.8,178.6-95.6c111.3,1.2,170.8,90.3,175.1,97"
            />
            <text>
              <textPath href={`#${pathId}`}>{label}</textPath>
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
}
