'use client';

import { Bell, Coffee, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BuildPatienceBannerProps {
  elapsedSeconds: number;
  className?: string;
  onEnableNotifications?: () => void;
}

/** Shown during long builds — reassures user they can leave the tab open or step away. */
export function BuildPatienceBanner({
  elapsedSeconds,
  className,
  onEnableNotifications,
}: BuildPatienceBannerProps) {
  if (elapsedSeconds < 90) return null;

  return (
    <div
      className={cn(
        'rounded-lg border border-[var(--accent)]/25 bg-[var(--accent)]/8 px-3 py-2.5 space-y-1.5 animate-in fade-in duration-500',
        className
      )}
    >
      <p className="text-[12px] font-semibold text-[var(--foreground)] flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
        XROGA is still building — you&apos;re in good hands
      </p>
      <p className="text-[11px] leading-relaxed text-[var(--foreground)]/80 flex items-start gap-1.5">
        <Coffee className="h-3.5 w-3.5 text-[var(--muted)] shrink-0 mt-0.5" />
        Please don&apos;t stop this response or change your selected repository. You can close this tab,
        use other apps, or even sleep — BLACK HOLE V∞ keeps working in the background.
      </p>
      {onEnableNotifications && (
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
