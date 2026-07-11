'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DownloadAppButtonProps {
  variant?: 'sidebar' | 'header' | 'homepage' | 'icon';
  className?: string;
}

function LaunchSoonPopup({ onClose }: { onClose: () => void }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[400] bg-black/45 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="fixed z-[410] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(320px,calc(100vw-28px))] rounded-2xl border border-[var(--accent)]/25 bg-[var(--card)] shadow-xl p-5 text-center">
        <Smartphone className="w-10 h-10 mx-auto text-[var(--accent)] mb-3" />
        <h3 className="font-bold text-lg">Xroga AI Mobile</h3>
        <p className="text-sm text-[var(--muted)] mt-2">Launching soon on iOS &amp; Android.</p>
        <button type="button" onClick={onClose} className="mt-4 w-full py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-bold">
          Got it
        </button>
      </div>
    </>,
    document.body
  );
}

export function DownloadAppButton({ variant = 'sidebar', className }: DownloadAppButtonProps) {
  const [open, setOpen] = useState(false);

  if (variant === 'icon') {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Download app — Launch soon"
          className={cn(
            'shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-[var(--accent)]/30 transition-all',
            className
          )}
          aria-label="Download app — launch soon"
        >
          <Smartphone className="w-4 h-4 text-[var(--accent)]" />
        </button>
        {open && <LaunchSoonPopup onClose={() => setOpen(false)} />}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'group flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-[var(--accent)]/30 transition-all',
          variant === 'sidebar' && 'w-full px-2.5 py-2 text-left',
          variant === 'header' && 'px-2.5 py-1.5 text-xs',
          className
        )}
        aria-label="Download app — launch soon"
      >
        <Smartphone className={cn('shrink-0 text-[var(--accent)]', variant === 'sidebar' ? 'w-4 h-4' : 'w-3.5 h-3.5')} />
        <span className="min-w-0 flex-1">
          <span className={cn('block font-semibold text-[var(--foreground)]', variant === 'sidebar' ? 'text-[11px]' : 'text-xs')}>
            Download app
          </span>
          {variant === 'sidebar' && (
            <span className="block text-[9px] text-amber-400/90 font-medium">Launch soon</span>
          )}
        </span>
      </button>
      {open && <LaunchSoonPopup onClose={() => setOpen(false)} />}
    </>
  );
}
