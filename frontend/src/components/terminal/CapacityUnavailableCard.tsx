'use client';

import { useState } from 'react';
import { Clock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatUnlockTime } from '@/lib/capacityMessage';

/**
 * Shown when a build stopped because today's unlocked AI capacity is used up.
 *
 * Two real ways to keep going, both honest about their trade-off:
 *
 * 1. **Wait** — the account's own daily drip refills on its own. The unlock time is
 *    shown exactly as the Plan & Usage panel shows it, so the two can never disagree.
 * 2. **Use full power now** — some people don't want to wait; they said so directly.
 *    This switches the account to Full Power pacing, which releases the rest of the
 *    month's capacity immediately instead of drip-feeding it, and resends the build
 *    that just got refused. The trade-off is stated before the button, not after: doing
 *    this can mean running out before the month renews. That warning is not a modal or
 *    a fine-print footnote — it sits directly under the one action it describes.
 */

export interface CapacityUnavailableMeta {
  prompt: string;
  nextUnlockAt?: string | null;
}

interface CapacityUnavailableCardProps {
  meta: CapacityUnavailableMeta;
  onUseFullPower: () => Promise<void>;
  className?: string;
}

export function CapacityUnavailableCard({ meta, onUseFullPower, className }: CapacityUnavailableCardProps) {
  const [switching, setSwitching] = useState(false);
  const unlockTime = formatUnlockTime(meta.nextUnlockAt);

  const handleClick = async () => {
    if (switching) return;
    setSwitching(true);
    try {
      await onUseFullPower();
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div
      className={cn(
        'rounded-xl border border-blue-500/30 bg-blue-500/8 px-3.5 py-3 space-y-2.5',
        className
      )}
    >
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
          Today&apos;s unlocked capacity is fully in use
        </p>
        {unlockTime && (
          <p className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
            <Clock className="h-3 w-3 shrink-0" />
            More unlocks {unlockTime} — or use full power now
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={handleClick}
        disabled={switching}
        className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <Zap className="h-3.5 w-3.5" />
        {switching ? 'Switching…' : 'Use full power now'}
      </button>

      <p className="text-[11px] text-[var(--muted)] leading-relaxed">
        This unlocks the rest of this month&apos;s capacity right away, so you can keep
        building without waiting. Using a lot now may mean less is available before the
        month renews.
      </p>
    </div>
  );
}
