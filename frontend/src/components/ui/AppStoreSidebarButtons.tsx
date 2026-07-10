'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';

function StorePopup({ store, onClose }: { store: 'google' | 'apple'; onClose: () => void }) {
  const title = store === 'google' ? 'Google Play' : 'App Store';
  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[400] bg-black/45 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="fixed z-[410] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(320px,calc(100vw-28px))] rounded-2xl border border-[var(--accent)]/25 bg-[var(--card)] shadow-xl p-5 text-center">
        <Smartphone className="w-10 h-10 mx-auto text-[var(--accent)] mb-3" />
        <h3 className="font-bold text-lg">{title}</h3>
        <p className="text-sm text-[var(--muted)] mt-2">Xroga AI mobile app — coming soon this year.</p>
        <button type="button" onClick={onClose} className="mt-4 w-full py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-bold">
          Got it
        </button>
      </div>
    </>,
    document.body
  );
}

function StoreBadge({
  variant,
  onClick,
  compact,
}: {
  variant: 'google' | 'apple';
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 rounded-xl bg-black text-white hover:scale-[1.01] transition-transform border border-white/10',
        compact ? 'px-2 py-1.5' : 'px-3 py-2'
      )}
      aria-label={variant === 'google' ? 'Get it on Google Play' : 'Download on the App Store'}
    >
      {variant === 'google' ? (
        <svg viewBox="0 0 24 24" className={cn('shrink-0', compact ? 'w-4 h-4' : 'w-5 h-5')} aria-hidden>
          <path fill="#00D9FF" d="M3 20.5V3.5C3 2.91 3.34 2.39 3.84 2.15L13.69 12 3.84 21.85C3.34 21.61 3 21.09 3 20.5Z" />
          <path fill="#00F076" d="M16.81 15.12L6.05 21.34 14.54 12.85 16.81 15.12Z" />
          <path fill="#FF3A44" d="M3.84 2.15L13.69 12 3.84 21.85 6.05 21.34 16.81 15.12 14.54 12.85 6.05 4.66 3.84 2.15Z" />
          <path fill="#FFD900" d="M16.81 8.88L6.05 2.66 14.54 11.15 16.81 8.88Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className={cn('shrink-0 fill-white', compact ? 'w-4 h-4' : 'w-5 h-5')} aria-hidden>
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
        </svg>
      )}
      <div className="text-left leading-tight min-w-0">
        <span className="block text-[7px] uppercase tracking-wide opacity-80 truncate">
          {variant === 'google' ? 'Get it on' : 'Download on the'}
        </span>
        <span className="block text-[10px] font-semibold truncate">
          {variant === 'google' ? 'Google Play' : 'App Store'}
        </span>
      </div>
      <span className="ml-auto text-[8px] font-bold uppercase tracking-wider text-amber-400/90 shrink-0">Soon</span>
    </button>
  );
}

export function AppStoreSidebarButtons({ compact }: { compact?: boolean }) {
  const [popup, setPopup] = useState<'google' | 'apple' | null>(null);
  return (
    <>
      <div className={cn('space-y-1.5', compact && 'space-y-1')}>
        <p className={cn('text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)] px-0.5', compact && 'sr-only')}>
          Download app
        </p>
        <StoreBadge variant="google" compact={compact} onClick={() => setPopup('google')} />
        <StoreBadge variant="apple" compact={compact} onClick={() => setPopup('apple')} />
      </div>
      {popup && <StorePopup store={popup} onClose={() => setPopup(null)} />}
    </>
  );
}
