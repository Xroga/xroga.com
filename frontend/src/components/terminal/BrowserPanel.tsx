'use client';

import { Monitor, X, Globe, Loader2 } from 'lucide-react';
import { useThemeStore } from '@/store/useThemeStore';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { cn } from '@/lib/utils';

export function BrowserPanelToggle() {
  const open = useThemeStore((s) => s.browserPanelOpen);
  const setOpen = useThemeStore((s) => s.setBrowserPanelOpen);

  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      className={cn(
        'p-1.5 rounded-lg transition-colors',
        open ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'hover:bg-white/10'
      )}
      title="Swarm browser — live automation view"
      aria-label="Toggle browser panel"
    >
      <Monitor className="w-3.5 h-3.5" />
    </button>
  );
}

export function BrowserPanel() {
  const open = useThemeStore((s) => s.browserPanelOpen);
  const setOpen = useThemeStore((s) => s.setBrowserPanelOpen);
  const { loading, prompt } = useTerminalChat();

  if (!open) return null;

  return (
    <div className="xv-browser-panel rounded-xl border border-[var(--card-border)] overflow-hidden universe-fade-in">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--card-border)]/40 bg-black/40">
        <Globe className="w-3.5 h-3.5 text-[var(--accent)]" />
        <span className="text-xs font-terminal flex-1 truncate">Swarm Browser — automation viewport</span>
        <button type="button" onClick={() => setOpen(false)} className="p-1 rounded hover:bg-white/10">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="relative aspect-video bg-[#0a0a0f] flex flex-col items-center justify-center p-6 text-center min-h-[180px]">
        {loading ? (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)] mb-3" />
            <p className="text-xs font-terminal text-white/70">Swarm is browsing & automating…</p>
            <p className="text-[10px] text-white/40 mt-1 max-w-sm truncate">{prompt || 'Waiting for task…'}</p>
          </>
        ) : (
          <>
            <Monitor className="w-10 h-10 text-white/20 mb-3" />
            <p className="text-xs font-terminal text-white/60">
              Browser opens here when you run scrape, automate, or research tasks.
            </p>
            <p className="text-[10px] text-white/35 mt-2">
              Try: &quot;Scrape product prices from Amazon&quot; or &quot;Automate this workflow&quot;
            </p>
          </>
        )}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-[var(--accent)]/50 to-transparent xv-browser-scan" />
      </div>
    </div>
  );
}
