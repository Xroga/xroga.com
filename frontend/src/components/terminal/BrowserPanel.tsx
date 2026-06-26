'use client';

import { Monitor, X, Globe, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import { useThemeStore } from '@/store/useThemeStore';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { cn } from '@/lib/utils';
import { HoverTip } from '@/components/ui/HoverTip';

export function BrowserPanelToggle() {
  const open = useThemeStore((s) => s.browserPanelOpen);
  const setOpen = useThemeStore((s) => s.setBrowserPanelOpen);

  return (
    <HoverTip
      label="Swarm Browser"
      description="Opens split view: half terminal, half live browser automation. Great for scrape and research tasks."
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'p-1.5 rounded-lg transition-colors',
          open ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'hover:bg-white/10'
        )}
        aria-label="Toggle browser panel"
      >
        <Monitor className="w-3.5 h-3.5" />
      </button>
    </HoverTip>
  );
}

interface BrowserPanelProps {
  mode?: 'split' | 'full';
}

export function BrowserPanel({ mode = 'split' }: BrowserPanelProps) {
  const browserFullscreen = useThemeStore((s) => s.browserFullscreen);
  const setBrowserFullscreen = useThemeStore((s) => s.setBrowserFullscreen);
  const closeBrowser = useThemeStore((s) => s.closeBrowser);
  const { loading, prompt } = useTerminalChat();

  const isFull = mode === 'full' || browserFullscreen;

  return (
    <div
      className={cn(
        'xv-browser-panel rounded-xl border border-[var(--card-border)] overflow-hidden universe-fade-in flex flex-col',
        isFull ? 'min-h-[60vh]' : 'min-h-[280px] h-full'
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--card-border)]/40 bg-black/60 shrink-0">
        <Globe className="w-3.5 h-3.5 text-[var(--accent)]" />
        <span className="text-xs font-terminal flex-1 truncate">
          Swarm Browser {isFull ? '— full view' : '— split view'}
        </span>
        <button
          type="button"
          onClick={() => setBrowserFullscreen(!browserFullscreen)}
          className="p-1 rounded hover:bg-white/10"
          title={isFull ? 'Split view' : 'Full browser'}
        >
          {isFull ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
        <button type="button" onClick={closeBrowser} className="p-1 rounded hover:bg-white/10" title="Close browser">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div
        className={cn(
          'relative flex-1 bg-[#0a0a0f] flex flex-col items-center justify-center p-6 text-center',
          isFull ? 'min-h-[50vh]' : 'min-h-[220px]'
        )}
      >
        {loading ? (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)] mb-3" />
            <p className="text-xs font-terminal text-white/70">Swarm is browsing & automating…</p>
            <p className="text-[10px] text-white/40 mt-1 max-w-sm truncate px-2">{prompt || 'Waiting for task…'}</p>
          </>
        ) : (
          <>
            <Monitor className="w-10 h-10 text-white/20 mb-3" />
            <p className="text-xs font-terminal text-white/60 max-w-xs">
              Browser opens here when you run scrape, automate, or research tasks.
            </p>
            <p className="text-[10px] text-white/35 mt-2 max-w-sm">
              Close browser to restore terminal to full width. Use maximize for full-screen browser.
            </p>
          </>
        )}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-[var(--accent)]/50 to-transparent xv-browser-scan" />
        {/* Simulated browser chrome */}
        <div className="absolute top-3 left-3 right-3 flex gap-1.5 opacity-30">
          <div className="w-2 h-2 rounded-full bg-red-400" />
          <div className="w-2 h-2 rounded-full bg-amber-400" />
          <div className="w-2 h-2 rounded-full bg-green-400" />
        </div>
      </div>
    </div>
  );
}
