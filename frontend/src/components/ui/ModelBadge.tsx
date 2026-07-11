'use client';

import { cn } from '@/lib/utils';
import {
  XROGA_BRAND,
  XROGA_MODEL_NAME,
  XROGA_MODEL_VERSION,
  XROGA_MODEL_SUBTEXT,
  XROGA_INFINITY_TOOLTIP_SHORT,
} from '@/lib/brand';

interface ModelBadgeProps {
  /** compact: single line · stacked: XROGA / Black Hole V∞ · inline: text flow */
  variant?: 'compact' | 'stacked' | 'inline' | 'hero';
  className?: string;
  showSubtext?: boolean;
}

export function ModelBadge({
  variant = 'stacked',
  className,
  showSubtext = false,
}: ModelBadgeProps) {
  const infinity = (
    <span
      className="xv-infinity-symbol cursor-help inline-flex items-center justify-center font-bold text-[var(--accent)] hover:text-[#a78bfa] transition-colors"
      title={XROGA_INFINITY_TOOLTIP_SHORT}
      aria-label={XROGA_INFINITY_TOOLTIP_SHORT}
      tabIndex={0}
    >
      ∞
    </span>
  );

  if (variant === 'compact') {
    return (
      <span className={cn('font-semibold tracking-tight', className)}>
        {XROGA_BRAND} {XROGA_MODEL_NAME} {XROGA_MODEL_VERSION.replace('∞', '')}
        {infinity}
      </span>
    );
  }

  if (variant === 'inline') {
    return (
      <span className={cn('inline-flex items-baseline gap-1 flex-wrap', className)}>
        <span className="font-bold">{XROGA_BRAND}</span>
        <span className="opacity-90">{XROGA_MODEL_NAME}</span>
        <span className="font-bold">
          V{infinity}
        </span>
      </span>
    );
  }

  if (variant === 'hero') {
    return (
      <div className={cn('text-center', className)}>
        <p className="text-[10px] sm:text-xs tracking-[0.35em] uppercase font-bold text-white/70 mb-1">
          {XROGA_BRAND}
        </p>
        <p className="text-sm sm:text-base font-semibold text-white/90 flex items-center justify-center gap-1">
          <span>{XROGA_MODEL_NAME}</span>
          <span className="font-bold text-white flex items-center gap-0.5">
            V{infinity}
          </span>
        </p>
        {showSubtext && (
          <p className="text-[9px] sm:text-[10px] text-white/45 mt-1 italic">{XROGA_MODEL_SUBTEXT}</p>
        )}
      </div>
    );
  }

  return (
    <div className={cn('leading-tight', className)}>
      <p className="text-[10px] uppercase tracking-[0.25em] font-bold opacity-60">{XROGA_BRAND}</p>
      <p className="text-sm font-semibold flex items-center gap-1">
        <span>{XROGA_MODEL_NAME}</span>
        <span className="font-bold flex items-center gap-0.5">
          V{infinity}
        </span>
      </p>
      {showSubtext && (
        <p className="text-[9px] opacity-50 mt-0.5 italic">{XROGA_MODEL_SUBTEXT}</p>
      )}
    </div>
  );
}
