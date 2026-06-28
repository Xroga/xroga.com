'use client';

import { useState, useCallback } from 'react';
import {
  Globe,
  Shield,
  Search,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Lock,
  Loader2,
} from 'lucide-react';
import { isUrlBlocked, normalizeBrowserInput, enforceSafeSearchOnUrl } from '@/lib/browserSafety';
import { useThemeStore } from '@/store/useThemeStore';
import { cn } from '@/lib/utils';

interface XrogaBrowserProps {
  className?: string;
  compact?: boolean;
}

const THEME_BODY: Record<string, string> = {
  white: 'bg-slate-100 text-slate-900',
  black: 'bg-[#0a0a0a] text-white',
  gray: 'bg-[#2a2a2a] text-white',
  image: 'bg-[#0a0a0f] text-white',
};

const THEME_CHROME: Record<string, string> = {
  white: 'border-slate-200 bg-slate-50 text-slate-800',
  black: 'border-white/10 bg-black/90 text-white',
  gray: 'border-black/30 bg-[#333] text-white',
  image: 'border-white/10 bg-black/80 text-white',
};

export function XrogaBrowser({ className, compact }: XrogaBrowserProps) {
  const theme = useThemeStore((s) => s.theme);
  const [input, setInput] = useState('');
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  const bodyClass = THEME_BODY[theme] ?? THEME_BODY.image;
  const chromeClass = THEME_CHROME[theme] ?? THEME_CHROME.image;

  const navigate = useCallback((raw: string) => {
    const { type, target } = normalizeBrowserInput(raw);
    if (!target) return;

    const url = type === 'url' ? enforceSafeSearchOnUrl(target) : target;

    if (isUrlBlocked(url)) {
      setBlocked(true);
      setCurrentUrl(null);
      return;
    }

    setBlocked(false);
    setLoading(true);
    setCurrentUrl(url);
    setHistory((h) => [...h.slice(0, historyIdx + 1), url]);
    setHistoryIdx((i) => i + 1);
    setInput(type === 'url' ? url.replace(/^https?:\/\//, '') : raw);
  }, [historyIdx]);

  function goBack() {
    if (historyIdx > 0) {
      const idx = historyIdx - 1;
      setHistoryIdx(idx);
      setCurrentUrl(history[idx]);
      setBlocked(false);
    }
  }

  function goForward() {
    if (historyIdx < history.length - 1) {
      const idx = historyIdx + 1;
      setHistoryIdx(idx);
      setCurrentUrl(history[idx]);
      setBlocked(false);
    }
  }

  return (
    <div className={cn('flex flex-col h-full min-h-[220px]', bodyClass, className)}>
      <div className={cn('flex items-center gap-1.5 px-2 py-2 border-b shrink-0', chromeClass)}>
        <Globe className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
        <span className="text-[10px] font-terminal shrink-0 hidden sm:inline opacity-80">
          Xroga Browser
        </span>
        <span title="Safe web search enabled">
          <Shield className="w-3 h-3 text-emerald-400 shrink-0" aria-hidden />
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          <button type="button" onClick={goBack} className="p-1 rounded hover:bg-black/10 opacity-70" aria-label="Back">
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={goForward} className="p-1 rounded hover:bg-black/10 opacity-70" aria-label="Forward">
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => currentUrl && navigate(currentUrl)}
            className="p-1 rounded hover:bg-black/10 opacity-70"
            aria-label="Reload"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
        <form
          className="flex-1 flex items-center gap-1 min-w-0"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(input);
          }}
        >
          <div className={cn('flex-1 flex items-center gap-1.5 px-2 py-1 rounded-lg border min-w-0', theme === 'white' ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10')}>
            <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search or enter URL — safe web search enforced"
              className={cn(
                'flex-1 bg-transparent text-[11px] focus:outline-none min-w-0 font-terminal',
                theme === 'white' ? 'text-slate-900 placeholder:text-slate-400' : 'text-white placeholder:text-white/40'
              )}
            />
            <button type="submit" className="p-0.5 text-[var(--accent)] shrink-0" aria-label="Go">
              <Search className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>

      <div className={cn('relative flex-1', compact ? 'min-h-[180px]' : 'min-h-[280px]')}>
        {blocked ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-red-950/40">
            <Shield className="w-12 h-12 text-red-400 mb-3" />
            <p className="text-sm font-semibold">Content Blocked</p>
            <p className="text-xs opacity-60 mt-2 max-w-xs">
              Xroga Browser blocks unsafe and NSFW content — even with VPN. This URL was blocked by our safety filter.
            </p>
          </div>
        ) : currentUrl ? (
          <>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
              </div>
            )}
            <iframe
              src={currentUrl}
              title="Xroga Browser"
              className="absolute inset-0 w-full h-full border-0 bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              onLoad={() => setLoading(false)}
            />
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <Globe className="w-10 h-10 opacity-20 mb-3" />
            <p className="text-xs font-terminal max-w-sm opacity-70">
              Xroga Safe Browser — search the web, automate tasks, and research with enforced safe web searches.
            </p>
            <p className="text-[10px] opacity-40 mt-2">
              Tier 1–4 safety: DNS filter · URL blocklist · SafeSearch · AI moderation (coming soon)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
