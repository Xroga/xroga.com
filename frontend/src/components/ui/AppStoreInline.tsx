'use client';

import { cn } from '@/lib/utils';

interface AppStoreInlineProps {
  className?: string;
  compact?: boolean;
}

function GooglePlayBadge({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'xv-store-badge-official inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black text-white',
        className
      )}
      aria-label="Get it on Google Play — Coming Soon"
    >
      <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden>
        <path fill="#00D9FF" d="M3 20.5V3.5C3 2.91 3.34 2.39 3.84 2.15L13.69 12 3.84 21.85C3.34 21.61 3 21.09 3 20.5Z" />
        <path fill="#00F076" d="M16.81 15.12L6.05 21.34 14.54 12.85 16.81 15.12Z" />
        <path fill="#FF3A44" d="M3.84 2.15L13.69 12 3.84 21.85 6.05 21.34 16.81 15.12 14.54 12.85 6.05 4.66 3.84 2.15Z" />
        <path fill="#FFD900" d="M16.81 8.88L6.05 2.66 14.54 11.15 16.81 8.88Z" />
      </svg>
      <div className="text-left leading-tight">
        <span className="block text-[7px] uppercase tracking-wide opacity-90">Get it on</span>
        <span className="block text-[11px] font-semibold -mt-0.5">Google Play</span>
      </div>
    </div>
  );
}

function AppStoreBadge({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'xv-store-badge-official inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black text-white',
        className
      )}
      aria-label="Download on the App Store — Coming Soon"
    >
      <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0 fill-white" aria-hidden>
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
      </svg>
      <div className="text-left leading-tight">
        <span className="block text-[7px] tracking-wide opacity-90">Download on the</span>
        <span className="block text-[11px] font-semibold -mt-0.5">App Store</span>
      </div>
    </div>
  );
}

/** Official-style store badges + Coming Soon */
export function AppStoreInline({ className, compact }: AppStoreInlineProps) {
  if (compact) {
    return (
      <div className={cn('inline-flex items-center gap-2 opacity-90', className)}>
        <GooglePlayBadge className="!px-2 !py-1 scale-90 origin-left" />
        <AppStoreBadge className="!px-2 !py-1 scale-90 origin-left" />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-3 sm:gap-4', className)}>
      <GooglePlayBadge />
      <AppStoreBadge />
      <span className="text-xs sm:text-sm font-bold xv-auth-gradient-text tracking-wide">Coming Soon</span>
    </div>
  );
}
