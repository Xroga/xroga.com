'use client';

import { Bell, Coffee, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BuildPatienceBannerProps {
  elapsedSeconds: number;
  className?: string;
  onEnableNotifications?: () => void;
}

/** Honest wait state driven by the elapsed time of a real active run. */
export function BuildPatienceBanner({
  elapsedSeconds,
  className,
  onEnableNotifications,
}: BuildPatienceBannerProps) {
  if (elapsedSeconds < 60) return null;
  const needsAttention = elapsedSeconds >= 5 * 60;

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2.5 space-y-1.5 animate-in fade-in duration-500',
        needsAttention
          ? 'border-amber-500/40 bg-amber-500/10'
          : 'border-[var(--accent)]/25 bg-[var(--accent)]/8',
        className,
      )}
    >
      {needsAttention ? (
        <>
          <p className="text-[12px] font-semibold text-[var(--foreground)] flex items-center gap-1.5">
            <Square className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            {Math.floor(elapsedSeconds / 60)}m - the active run is still waiting
          </p>
          <p className="text-[11px] leading-relaxed text-[var(--foreground)]/80">
            This is a real execution wait, not a fake busy loop. Waiting time does not consume
            additional AI capacity. If progress stays unchanged, press <strong>Stop</strong> and then <strong>Retry</strong>.
          </p>
        </>
      ) : (
        <>
          <p className="text-[12px] font-semibold text-[var(--foreground)] flex items-center gap-1.5">
            <Coffee className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
            Real build in progress - waiting for the next durable event
          </p>
          <p className="text-[11px] leading-relaxed text-[var(--foreground)]/80">
            Status changes only when the run advances. Complex projects can take a few minutes.
            Press <strong>Stop</strong> anytime to cancel.
          </p>
        </>
      )}
      {onEnableNotifications && !needsAttention && (
        <button
          type="button"
          onClick={onEnableNotifications}
          className="text-[10px] font-medium text-[var(--accent)] hover:underline inline-flex items-center gap-1"
        >
          <Bell className="h-3 w-3" />
          Notify me when this run finishes
        </button>
      )}
    </div>
  );
}
