'use client';

import { cn } from '@/lib/utils';

interface AppStoreInlineProps {
  className?: string;
  compact?: boolean;
}

function GooglePlayIcon({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="https://cdn.simpleicons.org/googleplay/94a3b8"
      alt=""
      className={cn('w-3.5 h-3.5 object-contain', className)}
      aria-hidden
    />
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="https://cdn.simpleicons.org/apple/94a3b8"
      alt=""
      className={cn('w-3.5 h-3.5 object-contain', className)}
      aria-hidden
    />
  );
}

/** Inline store row — no card, fits beside other homepage content */
export function AppStoreInline({ className, compact }: AppStoreInlineProps) {
  return (
    <div
      className={cn(
        'xv-app-store-inline inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1',
        compact ? 'text-[9px]' : 'text-[10px] sm:text-xs',
        className
      )}
    >
      {!compact && (
        <span className="text-[var(--muted)] opacity-80">Xroga AI mobile</span>
      )}
      <span className="inline-flex items-center gap-1 text-[var(--muted)]">
        <GooglePlayIcon />
        <span className="opacity-70">Play</span>
      </span>
      <span className="inline-flex items-center gap-1 text-[var(--muted)]">
        <AppleIcon />
        <span className="opacity-70">iOS</span>
      </span>
      <span className="font-semibold text-[#93c5fd] tracking-wide">Coming Soon</span>
    </div>
  );
}
