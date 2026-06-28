'use client';

import { useState } from 'react';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import { Globe } from 'lucide-react';
import { useThemeStore } from '@/store/useThemeStore';
import { XrogaBrowser } from '@/components/browser/XrogaBrowser';
import { cn } from '@/lib/utils';

export function BrowserPanelToggle() {
  const open = useThemeStore((s) => s.browserPanelOpen);
  const setOpen = useThemeStore((s) => s.setBrowserPanelOpen);
  const [tip, setTip] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setTip(true)}
      onMouseLeave={() => setTip(false)}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
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
      {tip && (
        <span className="xv-browser-mini-tip absolute right-0 top-full mt-1.5 z-[60] whitespace-nowrap pointer-events-none">
          Safe search · automations
        </span>
      )}
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
  const closeBrowser = useThemeStore((s) => s.closeBrowser);
  const theme = useThemeStore((s) => s.theme);
  const isFull = mode === 'full' || browserFullscreen;

  return (
    <div
      className={cn(
        'xv-browser-panel rounded-xl border overflow-hidden universe-fade-in flex flex-col',
        BROWSER_THEME_CLASS[theme] ?? 'xv-browser--image',
        isFull ? 'min-h-[40vh] sm:min-h-[60vh]' : 'min-h-[200px] sm:min-h-[280px] h-full'
      )}
    >
      <div className="xv-browser-chrome flex items-center gap-2 px-2 py-1.5 border-b shrink-0">
        <span className="text-[10px] font-terminal flex-1 truncate opacity-80">
          Xroga Browser {isFull ? '· full' : '· split'}
        </span>
        <button
          type="button"
          onClick={() => setBrowserFullscreen(!browserFullscreen)}
          className="p-1 rounded hover:bg-white/10 opacity-70"
          title={isFull ? 'Split view' : 'Full browser'}
        >
          {isFull ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
        <button type="button" onClick={closeBrowser} className="p-1 rounded hover:bg-white/10 opacity-70" title="Close">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <XrogaBrowser className="flex-1 rounded-none border-0" compact={!isFull} />
    </div>
  );
}
