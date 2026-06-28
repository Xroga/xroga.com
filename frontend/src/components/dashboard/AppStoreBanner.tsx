'use client';

import { useEffect, useState } from 'react';
import { X, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';

const DISMISS_KEY = 'xroga_app_banner_dismissed';

interface AppStoreBannerProps {
  variant: 'homepage' | 'dashboard';
  className?: string;
}

export function AppStoreBanner({ variant, className }: AppStoreBannerProps) {
  const [dismissed, setDismissed] = useState(variant === 'dashboard');

  useEffect(() => {
    if (variant === 'dashboard') {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    }
  }, [variant]);

  if (variant === 'dashboard' && dismissed) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  return (
    <div
      className={cn(
        'xv-app-store-banner flex flex-wrap items-center gap-3 rounded-xl border border-[var(--card-border)]',
        variant === 'homepage'
          ? 'justify-center px-4 py-3 bg-black/30 backdrop-blur-md'
          : 'px-3 py-2 bg-[var(--accent)]/8',
        className
      )}
    >
      <Smartphone className="w-4 h-4 text-[var(--accent)] shrink-0" />
      <p className="text-[10px] sm:text-xs text-[var(--foreground)]/90 min-w-0">
        <span className="font-semibold">Xroga AI mobile app</span>
        <span className="text-[var(--muted)]"> — Google Play & iOS coming this year</span>
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <span className="xv-store-badge">Google Play</span>
        <span className="xv-store-badge">App Store</span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400">Soon</span>
      </div>
      {variant === 'dashboard' && (
        <button
          type="button"
          onClick={dismiss}
          className="ml-auto p-1 rounded-md hover:bg-white/10 text-[var(--muted)]"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
