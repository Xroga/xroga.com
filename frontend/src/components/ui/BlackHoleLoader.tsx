'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';
import { XROGA_MODEL_NAME, XROGA_MODEL_VERSION } from '@/lib/brand';

const ORBIT_LABEL = `${XROGA_MODEL_NAME} ${XROGA_MODEL_VERSION}`;

interface BlackHoleLoaderProps {
  /** Homepage showcase sizes — not for terminal wait UI */
  size?: 'md' | 'lg' | 'xl';
  className?: string;
  /** Orbiting path text (homepage only) */
  showOrbitText?: boolean;
  label?: string;
}

/**
 * Black Hole V∞ visual for the homepage Black Hole section.
 * Do not use in terminal processing — use MorphWaitLoader there.
 */
export function BlackHoleLoader({
  size = 'lg',
  className,
  showOrbitText = true,
  label = ORBIT_LABEL,
}: BlackHoleLoaderProps) {
  const rawId = useId().replace(/:/g, '');
  const pathId = `xv-bh-orbit-${rawId}`;

  return (
    <div
      className={cn(
        'xv-bh-wrap',
        size === 'md' && 'xv-bh-wrap--md',
        size === 'lg' && 'xv-bh-wrap--lg',
        size === 'xl' && 'xv-bh-wrap--xl',
        className
      )}
      role="img"
      aria-label={label}
    >
      <div className="xv-bh-loader">
        <div className="xv-bh-blackhole" aria-hidden>
          <div className="xv-bh-circle" />
          <div className="xv-bh-disc" />
        </div>

        {showOrbitText ? (
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
        ) : null}
      </div>
    </div>
  );
}
