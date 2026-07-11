'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useThemeStore } from '@/store/useThemeStore';
import { useHydrated } from '@/hooks/useHydrated';

interface DownloadAppButtonProps {
  variant?: 'sidebar' | 'header' | 'homepage' | 'icon' | 'row' | 'compact';
  className?: string;
}

function LaunchSoonPopup({ onClose, theme }: { onClose: () => void; theme: string }) {
  if (typeof document === 'undefined') return null;

  const isLight = theme === 'white';

  return createPortal(
    <>
      <div className="fixed inset-0 z-[400] bg-black/45 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        className={cn(
          'fixed z-[410] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(320px,calc(100vw-28px))] rounded-2xl p-5 text-center shadow-xl',
          isLight ? 'glass-panel border border-[var(--card-border)]' : 'glass-panel-strong border border-[var(--card-border)]'
        )}
      >
        <Smartphone className="w-10 h-10 mx-auto text-[var(--accent)] mb-3" />
        <h3 className="font-bold text-lg text-[var(--foreground)]">Xroga AI Mobile</h3>
        <p className="text-sm text-[var(--muted)] mt-2">Launching soon on iOS &amp; Android.</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full py-2 rounded-xl bg-[var(--accent)] text-[var(--background)] text-sm font-bold hover:opacity-90 transition-opacity"
        >
          Got it
        </button>
      </div>
    </>,
    document.body
  );
}

export function DownloadAppButton({ variant = 'sidebar', className }: DownloadAppButtonProps) {
  const [open, setOpen] = useState(false);
  const hydrated = useHydrated();
  const theme = useThemeStore((s) => s.theme);

  if (variant === 'icon' || variant === 'compact') {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Xroga app — Launch soon"
          className={cn(
            'shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-[var(--accent)]/30 transition-all',
            className
          )}
          aria-label="Xroga app — launch soon"
        >
          <Smartphone className="w-4 h-4 text-[var(--accent)]" />
        </button>
        {open && hydrated && <LaunchSoonPopup onClose={() => setOpen(false)} theme={theme} />}
      </>
    );
  }

  if (variant === 'row') {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Xroga app — Launch soon"
          className={cn(
            'xv-sidebar-download-row shrink-0 flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-[var(--accent)]/30 transition-all',
            className
          )}
          aria-label="Xroga app — launch soon"
        >
          <Smartphone className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
          <span className="text-[10px] font-bold text-[var(--foreground)] leading-none">App</span>
        </button>
        {open && hydrated && <LaunchSoonPopup onClose={() => setOpen(false)} theme={theme} />}
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
        aria-label="Xroga app — launch soon"
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
      {open && hydrated && <LaunchSoonPopup onClose={() => setOpen(false)} theme={theme} />}
    </>
  );
}
