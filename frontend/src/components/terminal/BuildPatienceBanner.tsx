'use client';

import { Bell, Coffee, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BuildPatienceBannerProps {
  elapsedSeconds: number;
  className?: string;
  onEnableNotifications?: () => void;
}

/**
 * Honest wait banner. Client does not auto-kill paid model calls —
 * user presses Stop if todos stay frozen.
 */
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
            {Math.floor(elapsedSeconds / 60)}m — still waiting on the model (or quota)
          </p>
          <p className="text-[11px] leading-relaxed text-[var(--foreground)]/80">
            This is a real API wait, not a fake busy loop. Waiting time does not add OpenRouter
            charges. If to-dos stay frozen, press <strong>Stop</strong> then <strong>Retry</strong> —
            you only pay for completed model calls.
          </p>
        </>
      ) : (
        <>
          <p className="text-[12px] font-semibold text-[var(--foreground)] flex items-center gap-1.5">
            <Coffee className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
            Real build in progress — waiting on model responses
          </p>
          <p className="text-[11px] leading-relaxed text-[var(--foreground)]/80">
            Status updates when the swarm advances. Simple landings should move past planning
            quickly; chatbot/crypto can take a few minutes. Press <strong>Stop</strong> anytime to
            cancel.
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
