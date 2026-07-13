'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Maximize2, Minimize2, Globe } from 'lucide-react';
import { useThemeStore } from '@/store/useThemeStore';
import { XrogaBrowser } from '@/components/browser/XrogaBrowser';
import { cn } from '@/lib/utils';

export function BrowserPanelToggle() {
  const open = useThemeStore((s) => s.browserPanelOpen);
  const setOpen = useThemeStore((s) => s.setBrowserPanelOpen);
  const [tip, setTip] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [tipPos, setTipPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!tip || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setTipPos({ top: r.bottom + 6, left: Math.max(12, r.right - 220) });
  }, [tip]);

  const tooltip =
    tip && typeof document !== 'undefined'
      ? createPortal(
          <span
            className="fixed xv-browser-mini-tip whitespace-normal max-w-[220px] pointer-events-none z-[280]"
            style={{ top: tipPos.top, left: tipPos.left }}
          >
            Safe search · automations · runs on your device ($0)
          </span>,
          document.body
        )
      : null;

  return (
    <span className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setTip(true)}
        onMouseLeave={() => setTip(false)}
        onFocus={() => setTip(true)}
        onBlur={() => setTip(false)}
        className={cn(
          'xv-browser-toggle inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all',
          open
            ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)]'
            : 'border-[var(--card-border)] bg-white/[0.03] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--accent)]/30'
        )}
        aria-label="Toggle Xroga Browser"
      >
        <Globe className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Browser</span>
      </button>
      {tooltip}
    </span>
  );
}

interface BrowserPanelProps {
  mode?: 'split' | 'full';
}

const BROWSER_THEME_CLASS: Record<string, string> = {
  white: 'xv-browser--light',
  black: 'xv-browser--dark',
  gray: 'xv-browser--gray',
  image: 'xv-browser--image',
};

export function BrowserPanel({ mode = 'split' }: BrowserPanelProps) {
  const browserFullscreen = useThemeStore((s) => s.browserFullscreen);
  const setBrowserFullscreen = useThemeStore((s) => s.setBrowserFullscreen);
  const setOpen = useThemeStore((s) => s.setBrowserPanelOpen);
  const terminalSkin = useThemeStore((s) => s.terminalSkin);
  const themeClass = BROWSER_THEME_CLASS[terminalSkin] ?? 'xv-browser--dark';

  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--card-border)] overflow-hidden flex flex-col min-h-[280px] bg-[var(--card)]/80 backdrop-blur-md',
        mode === 'full' ? 'h-[min(70vh,520px)]' : 'h-[min(calc(100vh-10rem),760px)]',
        themeClass
      )}
    >
      <div className="xv-browser-chrome flex items-center gap-2 px-3 py-2 border-b shrink-0">
        <Globe className="w-3.5 h-3.5 opacity-70" />
        <span className="text-[10px] font-semibold flex-1">Xroga Browser</span>
        <span className="hidden md:inline text-[10px] text-[var(--muted)]">
          Use this area for live research, docs, site reviews, and browser-led tasks.
        </span>
        <button
          type="button"
          onClick={() => setBrowserFullscreen(!browserFullscreen)}
          className="p-1 rounded hover:bg-white/10"
          aria-label={browserFullscreen ? 'Exit browser fullscreen' : 'Browser fullscreen'}
        >
          {browserFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="p-1 rounded hover:bg-white/10" aria-label="Close browser">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <XrogaBrowser />
      </div>
    </div>
  );
}
