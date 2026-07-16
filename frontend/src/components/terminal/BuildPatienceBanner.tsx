'use client';

import { Bell, Coffee, Sparkles, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BuildPatienceBannerProps {
  elapsedSeconds: number;
  className?: string;
  onEnableNotifications?: () => void;
}

/** Shown during long builds — reassures early; warns about API cost if stuck. */
export function BuildPatienceBanner({
  elapsedSeconds,
  className,
  onEnableNotifications,
}: BuildPatienceBannerProps) {
  if (elapsedSeconds < 90) return null;

  // After ~8 minutes the build should already have shipped or hit budget —
  // lingering usually means wasted provider spend.
  const costRisk = elapsedSeconds >= 8 * 60;

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
            Still building after {Math.floor(elapsedSeconds / 60)}m — this may be wasting API cost
          </p>
          <p className="text-[11px] leading-relaxed text-[var(--foreground)]/80">
            Press <strong>Stop</strong> if todos are not advancing. You only pay for work already
            completed; leaving a stuck polish loop running burns DeepSeek/Grok credits with no new
            preview.
          </p>
        </>
      ) : (
        <>
          <p className="text-[12px] font-semibold text-[var(--foreground)] flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
            XROGA is still building — you&apos;re in good hands
          </p>
          <p className="text-[11px] leading-relaxed text-[var(--foreground)]/80 flex items-start gap-1.5">
            <Coffee className="h-3.5 w-3.5 text-[var(--muted)] shrink-0 mt-0.5" />
            You can leave this tab open. If the timer passes ~8 minutes with no progress, press Stop
            to protect API credits — builds now auto-ship when their budget is reached.
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
