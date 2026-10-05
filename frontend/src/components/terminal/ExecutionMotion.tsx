'use client';

import { cn } from '@/lib/utils';

export function ExecutionShimmerText({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn('xv-exec-shimmer', className)}>{children}</span>;
}

export function ExecutionPulse({ className }: { className?: string }) {
  return <span className={cn('xv-exec-pulse', className)} aria-hidden="true" />;
}

/**
 * Compact universal run orb adapted from the supplied Uiverse sphere loader.
 * It intentionally keeps the user's red/blue/yellow/cyan/white palette, but is
 * scaled for a transcript header instead of a full-page loader.
 */
export function UniversalExecutionOrb({ className }: { className?: string }) {
  return (
    <span className={cn('xv-exec-orb', className)} aria-hidden="true">
      <span className="xv-exec-orb__sphere" />
      <svg viewBox="0 0 100 100" focusable="false">
        <defs>
          <mask id="xv-exec-orb-waves">
            <g fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round">
              <path className="xv-exec-wave xv-exec-wave--one" d="M5,50 C25,50 30,20 50,20 C70,20 75,50 95,50" />
              <path className="xv-exec-wave xv-exec-wave--two" d="M5,50 C25,50 30,20 50,20 C70,20 75,50 95,50" />
              <path className="xv-exec-wave xv-exec-wave--three" d="M5,50 C25,50 30,80 50,80 C70,80 75,50 95,50" />
              <path className="xv-exec-wave xv-exec-wave--four" d="M5,50 C25,50 30,80 50,80 C70,80 75,50 95,50" />
            </g>
          </mask>
          <mask id="xv-exec-orb-clip">
            <ellipse cx="50" cy="50" rx="27" ry="50" fill="white" />
          </mask>
          <mask id="xv-exec-orb-fade">
            <ellipse cx="50" cy="50" rx="46" ry="50" fill="white" />
          </mask>
        </defs>
        <g mask="url(#xv-exec-orb-fade)">
          <g mask="url(#xv-exec-orb-clip)">
            <circle cx="50" cy="50" r="50" className="xv-exec-orb__waves-fill" mask="url(#xv-exec-orb-waves)" />
          </g>
        </g>
      </svg>
    </span>
  );
}

/**
 * Search-specific motion adapted from the supplied magnifying-glass loader.
 * The animated bars are decorative; the text and canonical activity rows carry
 * the actual query/source evidence.
 */
export function SearchScanner({ className }: { className?: string }) {
  return (
    <span className={cn('xv-exec-search-scan', className)} aria-hidden="true">
      <span className="xv-exec-search-scan__bars">
        <span />
        <span />
      </span>
      <svg viewBox="0 0 101 114" focusable="false">
        <circle
          strokeWidth="7"
          transform="rotate(36.0692 46.1726 46.1727)"
          r="29.5497"
          cy="46.1727"
          cx="46.1726"
        />
        <line strokeWidth="7" y2="111.784" x2="97.7088" y1="67.7837" x1="61.7089" />
      </svg>
    </span>
  );
}

/**
 * Used only when the active run has produced no new observable event for a while.
 * This communicates delay without falsely claiming the backend failed.
 */
export function StalledDots({ className }: { className?: string }) {
  return (
    <span className={cn('xv-exec-stalled-dots', className)} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

/**
 * Compact search globe retained for completed/research history surfaces where a
 * scanner would be too visually active.
 */
export function SearchGlobe({ className }: { className?: string }) {
  return (
    <span className={cn('xv-exec-globe', className)} aria-hidden="true">
      <svg viewBox="0 0 200 200" focusable="false">
        <path
          className="xv-exec-globe-land xv-exec-globe-land--one"
          transform="translate(100 100)"
          d="M29.4,-17.4C33.1,1.8,27.6,16.1,11.5,31.6C-4.7,47,-31.5,63.6,-43,56C-54.5,48.4,-50.7,16.6,-41,-10.9C-31.3,-38.4,-15.6,-61.5,-1.4,-61C12.8,-60.5,25.7,-36.5,29.4,-17.4Z"
        />
        <path
          className="xv-exec-globe-land xv-exec-globe-land--two"
          transform="translate(100 100)"
          d="M31.7,-55.8C40.3,-50,45.9,-39.9,49.7,-29.8C53.5,-19.8,55.5,-9.9,53.1,-1.4C50.6,7.1,43.6,14.1,41.8,27.6C40.1,41.1,43.4,61.1,37.3,67C31.2,72.9,15.6,64.8,1.5,62.2C-12.5,59.5,-25,62.3,-31.8,56.7C-38.5,51.1,-39.4,37.2,-49.3,26.3C-59.1,15.5,-78,7.7,-77.6,0.2C-77.2,-7.2,-57.4,-14.5,-49.3,-28.4C-41.2,-42.4,-44.7,-63,-38.5,-70.1C-32.2,-77.2,-16.1,-70.8,-2.3,-66.9C11.6,-63,23.1,-61.5,31.7,-55.8Z"
        />
      </svg>
    </span>
  );
}

export function ExecutionBranch({
  active,
  complete,
  last,
}: {
  active: boolean;
  complete: boolean;
  last: boolean;
}) {
  return (
    <span className="xv-exec-branch" aria-hidden="true">
      <svg viewBox="0 0 28 40" preserveAspectRatio="none">
        {!last ? <path className="xv-exec-branch-base" d="M8 0 V40" /> : null}
        <path className="xv-exec-branch-base" d="M8 0 V12 A8 8 0 0 0 16 20 H28" />
        <path
          className={cn(
            'xv-exec-branch-reach',
            active && 'xv-exec-branch-reach--active',
            complete && 'xv-exec-branch-reach--complete',
          )}
          d="M8 0 V12 A8 8 0 0 0 16 20 H28"
          pathLength="1"
        />
      </svg>
    </span>
  );
}
