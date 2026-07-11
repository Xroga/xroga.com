'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DownloadAppButtonProps {
  variant?: 'sidebar' | 'header' | 'homepage' | 'icon' | 'compact';
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

  if (variant === 'icon' || variant === 'compact') {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Download app — Launch soon"
          className={cn(
            'xv-download-sidebar-btn xv-download-sidebar-btn--compact',
            className
          )}
          aria-label="Download app — launch soon"
        >
          <span className="xv-download-sidebar-btn__icon">
            <Download className="w-4 h-4" />
          </span>
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
        className={cn('xv-download-sidebar-btn', className)}
        aria-label="Download app — launch soon"
      >
        <span className="xv-download-sidebar-btn__icon">
          <Download className="w-4 h-4" />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-[11px] font-semibold text-[var(--foreground)] leading-tight">
            Download app
          </span>
          <span className="block text-[9px] text-[#4a7aff]/90 font-medium">Launch soon</span>
        </span>
        <Smartphone className="w-3.5 h-3.5 text-white/25 shrink-0" aria-hidden />
      </button>
      {open && <LaunchSoonPopup onClose={() => setOpen(false)} />}
    </>
  );
}
