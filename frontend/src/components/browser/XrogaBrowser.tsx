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
  Plus,
  X,
  History,
  Sparkles,
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

interface BrowserTab {
  id: string;
  label: string;
  input: string;
  currentUrl: string | null;
  blocked: boolean;
  loading: boolean;
  loadError: boolean;
  history: string[];
  historyIdx: number;
}

function makeTab(label = 'New tab'): BrowserTab {
  return {
    id: typeof crypto !== 'undefined' ? crypto.randomUUID() : `tab-${Date.now()}`,
    label,
    input: '',
    currentUrl: null,
    blocked: false,
    loading: false,
    loadError: false,
    history: [],
    historyIdx: -1,
  };
}

function shortLabel(url: string | null, fallback = 'New tab'): string {
  if (!url) return fallback;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('duckduckgo.com')) {
      const q = parsed.searchParams.get('q');
      if (q) return decodeURIComponent(q).slice(0, 24);
    }
    return parsed.hostname.replace(/^www\./, '') || fallback;
  } catch {
    return fallback;
  }
}

function browserFrameUrl(target: string | null): string | null {
  if (!target) return null;
  return `/api/browser-view?target=${encodeURIComponent(target)}`;
}

const INITIAL_TAB = makeTab('Search');

export function XrogaBrowser({ className, compact }: XrogaBrowserProps) {
  const theme = useThemeStore((s) => s.theme);
  const [tabs, setTabs] = useState<BrowserTab[]>([INITIAL_TAB]);
  const [activeTabId, setActiveTabId] = useState<string>(INITIAL_TAB.id);

  const bodyClass = THEME_BODY[theme] ?? THEME_BODY.image;
  const chromeClass = THEME_CHROME[theme] ?? THEME_CHROME.image;
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]!;
  const activeFrameUrl = browserFrameUrl(activeTab.currentUrl);

  const updateTab = useCallback((tabId: string, updater: (tab: BrowserTab) => BrowserTab) => {
    setTabs((current) => current.map((tab) => (tab.id === tabId ? updater(tab) : tab)));
  }, []);

  const navigate = useCallback((raw: string) => {
    const { type, target } = normalizeBrowserInput(raw);
    if (!target) return;

    const url = type === 'url' ? enforceSafeSearchOnUrl(target) : target;

    if (isUrlBlocked(url)) {
      updateTab(activeTab.id, (tab) => ({
        ...tab,
        blocked: true,
        currentUrl: null,
        loading: false,
        label: 'Blocked',
      }));
      return;
    }

    updateTab(activeTab.id, (tab) => {
      const nextHistory = [...tab.history.slice(0, tab.historyIdx + 1), url];
      const nextIdx = nextHistory.length - 1;
      return {
        ...tab,
        blocked: false,
        loading: true,
        loadError: false,
        currentUrl: url,
        history: nextHistory,
        historyIdx: nextIdx,
        input: type === 'url' ? url.replace(/^https?:\/\//, '') : raw,
        label: shortLabel(url, type === 'search' ? 'Search' : 'Tab'),
      };
    });
  }, [activeTab.id, updateTab]);

  function goBack() {
    if (activeTab.historyIdx <= 0) return;
    updateTab(activeTab.id, (tab) => {
      const idx = tab.historyIdx - 1;
      const url = tab.history[idx] ?? null;
      return {
        ...tab,
        historyIdx: idx,
        currentUrl: url,
        blocked: false,
        loading: false,
        input: url ? url.replace(/^https?:\/\//, '') : tab.input,
        label: shortLabel(url, tab.label),
      };
    });
  }

  function goForward() {
    if (activeTab.historyIdx >= activeTab.history.length - 1) return;
    updateTab(activeTab.id, (tab) => {
      const idx = tab.historyIdx + 1;
      const url = tab.history[idx] ?? null;
      return {
        ...tab,
        historyIdx: idx,
        currentUrl: url,
        blocked: false,
        loading: false,
        input: url ? url.replace(/^https?:\/\//, '') : tab.input,
        label: shortLabel(url, tab.label),
      };
    });
  }

  function openNewTab() {
    const tab = makeTab(`Tab ${tabs.length + 1}`);
    setTabs((current) => [...current, tab]);
    setActiveTabId(tab.id);
  }

  function closeTab(tabId: string) {
    if (tabs.length === 1) {
      const replacement = makeTab('Search');
      setTabs([replacement]);
      setActiveTabId(replacement.id);
      return;
    }
    const idx = tabs.findIndex((tab) => tab.id === tabId);
    const nextTabs = tabs.filter((tab) => tab.id !== tabId);
    setTabs(nextTabs);
    if (tabId === activeTabId) {
      const fallback = nextTabs[Math.max(0, idx - 1)] ?? nextTabs[0];
      if (fallback) setActiveTabId(fallback.id);
    }
  }

  return (
    <div className={cn('flex flex-col h-full min-h-[220px]', bodyClass, className)}>
      <div className={cn('flex items-center gap-1 px-2 py-1.5 border-b shrink-0 overflow-x-auto scrollbar-hide', chromeClass)}>
        {tabs.map((tab) => {
          const selected = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabId(tab.id)}
              className={cn(
                'group inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-medium whitespace-nowrap transition-colors',
                selected
                  ? 'border-[var(--accent)]/40 bg-[var(--accent)]/12 text-[var(--foreground)]'
                  : 'border-white/10 bg-white/5 text-[var(--muted)] hover:text-[var(--foreground)]'
              )}
            >
              <Globe className="w-3 h-3 shrink-0" />
              <span>{tab.label}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    closeTab(tab.id);
                  }
                }}
                className="rounded p-0.5 opacity-60 hover:opacity-100"
                aria-label={`Close ${tab.label}`}
              >
                <X className="w-3 h-3" />
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={openNewTab}
          className="inline-flex items-center gap-1 rounded-lg border border-dashed border-white/15 bg-white/5 px-2 py-1 text-[10px] text-[var(--muted)] hover:text-[var(--foreground)]"
          aria-label="Open new browser tab"
        >
          <Plus className="w-3 h-3" />
          New tab
        </button>
      </div>
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
            onClick={() => activeTab.currentUrl && navigate(activeTab.currentUrl)}
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
            navigate(activeTab.input);
          }}
        >
          <div className={cn('flex-1 flex items-center gap-1.5 px-2 py-1 rounded-lg border min-w-0', theme === 'white' ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10')}>
            <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
            <input
              value={activeTab.input}
              onChange={(e) => updateTab(activeTab.id, (tab) => ({ ...tab, input: e.target.value }))}
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
      <div className={cn('border-b shrink-0 px-2 py-2', chromeClass)}>
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted)] mb-1.5">
          <History className="w-3 h-3" />
          <span className="font-semibold">Current tab history</span>
          <span className="opacity-60">Use this area for research, browsing docs, checking competitor sites, safe search, and step-by-step automation.</span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {activeTab.history.length > 0 ? (
            activeTab.history.slice().reverse().map((url, reverseIdx) => {
              const idx = activeTab.history.length - 1 - reverseIdx;
              const activeHistory = idx === activeTab.historyIdx;
              return (
                <button
                  key={`${activeTab.id}-${url}-${idx}`}
                  type="button"
                  onClick={() =>
                    updateTab(activeTab.id, (tab) => ({
                      ...tab,
                      historyIdx: idx,
                      currentUrl: url,
                      blocked: false,
                      loading: false,
                      input: url.replace(/^https?:\/\//, ''),
                      label: shortLabel(url, tab.label),
                    }))
                  }
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] whitespace-nowrap transition-colors',
                    activeHistory
                      ? 'border-[var(--accent)]/45 bg-[var(--accent)]/15 text-[var(--foreground)]'
                      : 'border-white/10 bg-white/5 text-[var(--muted)] hover:text-[var(--foreground)]'
                  )}
                >
                  <Globe className="w-3 h-3" />
                  {shortLabel(url, 'Page')}
                </button>
              );
            })
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-white/10 px-2 py-1 text-[10px] text-[var(--muted)]">
              <Sparkles className="w-3 h-3" />
              Open a search or URL to build tab history here
            </span>
          )}
        </div>
      </div>

      <div className={cn('relative flex-1', compact ? 'min-h-[180px]' : 'min-h-[280px]')}>
        {activeTab.blocked ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-red-950/40">
            <Shield className="w-12 h-12 text-red-400 mb-3" />
            <p className="text-sm font-semibold">Content Blocked</p>
            <p className="text-xs opacity-60 mt-2 max-w-xs">
              Xroga Browser blocks unsafe and NSFW content — even with VPN. This URL was blocked by our safety filter.
            </p>
          </div>
        ) : activeTab.currentUrl ? (
          <>
            {activeTab.loading && !activeTab.loadError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
              </div>
            )}
            {activeTab.loadError ? (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#f3e8d8] p-6 text-center text-slate-800">
                <Globe className="h-10 w-10 text-slate-400" />
                <p className="text-sm font-semibold">Could not load this page inside Xroga Browser</p>
                <p className="max-w-sm text-xs text-slate-600">
                  Some sites block embedded views. Open the page externally or try a search instead.
                </p>
                <a
                  href={activeTab.currentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-1.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/20"
                >
                  Open {shortLabel(activeTab.currentUrl, 'page')} externally
                </a>
              </div>
            ) : (
              <iframe
                src={activeFrameUrl ?? undefined}
                title="Xroga Browser"
                className="absolute inset-0 w-full h-full border-0 bg-white"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                onLoad={() => updateTab(activeTab.id, (tab) => ({ ...tab, loading: false, loadError: false }))}
                onError={() => updateTab(activeTab.id, (tab) => ({ ...tab, loading: false, loadError: true }))}
              />
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <Globe className="w-10 h-10 opacity-20 mb-3" />
            <p className="text-xs font-terminal max-w-sm opacity-70">
              Xroga Safe Browser is your live research and automation area — open docs, compare products, inspect sites, and keep browsing visible while the terminal keeps scrolling.
            </p>
            <p className="text-[10px] opacity-40 mt-2">
              Use tabs for separate tasks · SafeSearch enforced · Tier 1–4 safety: DNS filter · URL blocklist · SafeSearch · AI moderation (coming soon)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
