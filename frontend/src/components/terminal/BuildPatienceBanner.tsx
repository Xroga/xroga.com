'use client';

import { Bell, Coffee, Sparkles, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BuildPatienceBannerProps {
  elapsedSeconds: number;
  className?: string;
  onEnableNotifications?: () => void;
}

/** Shown during long builds — honest wait; warns + auto-stop protects API cost. */
export function BuildPatienceBanner({
  elapsedSeconds,
  className,
  onEnableNotifications,
}: BuildPatienceBannerProps) {
  if (elapsedSeconds < 60) return null;

  const costRisk = elapsedSeconds >= 5 * 60;

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2.5 space-y-1.5 animate-in fade-in duration-500',
        costRisk
          ? 'border-amber-500/40 bg-amber-500/10'
          : 'border-[var(--accent)]/25 bg-[var(--accent)]/8',
        className
      )}
    >
      {costRisk ? (
        <>
          <p className="text-[12px] font-semibold text-[var(--foreground)] flex items-center gap-1.5">
            <Square className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            {Math.floor(elapsedSeconds / 60)}m with little progress — protecting your API credits
          </p>
          <p className="text-[11px] leading-relaxed text-[var(--foreground)]/80">
            If to-dos are not advancing, we auto-stop fake busy loops. Press <strong>Stop</strong> anytime —
            you only pay for real completed API work, not spinning animations.
          </p>
        </>
      ) : (
        <>
          <p className="text-[12px] font-semibold text-[var(--foreground)] flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
            Real build in progress — not a fake animation
          </p>
          <p className="text-[11px] leading-relaxed text-[var(--foreground)]/80 flex items-start gap-1.5">
            <Coffee className="h-3.5 w-3.5 text-[var(--muted)] shrink-0 mt-0.5" />
            Status updates only when the swarm actually moves. Builds auto-ship or stop within a few
            minutes so you are not left waiting on endless polish.
          </p>
        </>
      )}
      {onEnableNotifications && !costRisk && (
        <button
          type="button"
          onClick={onEnableNotifications}
          className="text-[10px] font-medium text-[var(--accent)] hover:underline inline-flex items-center gap-1"
        >
          <Bell className="h-3 w-3" />
          Turn on notifications — we&apos;ll alert you when your project is ready
        </button>
      )}
    </div>
  );
}
