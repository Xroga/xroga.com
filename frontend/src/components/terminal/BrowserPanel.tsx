'use client';

import { X, Maximize2, Minimize2 } from 'lucide-react';
import { useThemeStore } from '@/store/useThemeStore';
import { XrogaBrowser } from '@/components/browser/XrogaBrowser';
import { cn } from '@/lib/utils';
import { SidebarTip } from '@/components/ui/SidebarTip';
import { Globe } from 'lucide-react';

export function BrowserPanelToggle() {
  const open = useThemeStore((s) => s.browserPanelOpen);
  const setOpen = useThemeStore((s) => s.setBrowserPanelOpen);

  return (
    <SidebarTip label="Xroga Browser" description="Safe browser — search, automate, research. Adult content banned.">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'p-1.5 rounded-lg transition-colors flex items-center gap-1',
          open ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'hover:bg-white/10'
        )}
        aria-label="Toggle Xroga Browser"
      >
        <Globe className="w-3.5 h-3.5" />
        <span className="text-[9px] font-terminal hidden sm:inline">Browser</span>
      </button>
    </SidebarTip>
  );
}

interface BrowserPanelProps {
  mode?: 'split' | 'full';
}

export function BrowserPanel({ mode = 'split' }: BrowserPanelProps) {
  const browserFullscreen = useThemeStore((s) => s.browserFullscreen);
  const setBrowserFullscreen = useThemeStore((s) => s.setBrowserFullscreen);
  const closeBrowser = useThemeStore((s) => s.closeBrowser);
  const isFull = mode === 'full' || browserFullscreen;

  return (
    <div
      className={cn(
        'xv-browser-panel rounded-xl border border-[var(--card-border)] overflow-hidden universe-fade-in flex flex-col',
        isFull ? 'min-h-[60vh]' : 'min-h-[280px] h-full'
      )}
    >
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--card-border)]/40 bg-black/80 shrink-0">
        <span className="text-[10px] font-terminal flex-1 truncate text-white/80">
          Xroga Browser {isFull ? '· full' : '· split'}
        </span>
        <button
          type="button"
          onClick={() => setBrowserFullscreen(!browserFullscreen)}
          className="p-1 rounded hover:bg-white/10 text-white/70"
          title={isFull ? 'Split view' : 'Full browser'}
        >
          {isFull ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
        <button type="button" onClick={closeBrowser} className="p-1 rounded hover:bg-white/10 text-white/70" title="Close">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <XrogaBrowser className="flex-1 rounded-none border-0" compact={!isFull} />
    </div>
  );
}
