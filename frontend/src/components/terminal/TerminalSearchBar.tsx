'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ChevronRight, User, Bot, Cog } from 'lucide-react';
import type { ChatMessage } from '@/context/TerminalChatContext';
import {
  buildTerminalSearchEntries,
  filterTerminalSearchEntries,
  formatTerminalSearchTime,
} from '@/lib/terminalSearch';
import { cn } from '@/lib/utils';

const VISIBLE_ROWS = 5;

export function TerminalSearchBar({
  messages,
  searchHit,
  onJump,
  compact = false,
}: {
  messages: ChatMessage[];
  searchHit: string | null;
  onJump: (messageId: string) => void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 320 });

  const entries = useMemo(() => buildTerminalSearchEntries(messages), [messages]);
  const filtered = useMemo(() => filterTerminalSearchEntries(entries, query), [entries, query]);
  const shown = filtered.slice(0, 50);

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);
    setDropdownPos({
      top: r.bottom + 6,
      left: Math.max(12, Math.min(r.right - width, window.innerWidth - width - 12)),
      width,
    });
  }, [open, query, compact]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      const portal = document.getElementById('xv-terminal-search-portal');
      if (portal?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function jump(messageId: string) {
    onJump(messageId);
    setOpen(false);
  }

  const roleIcon = (role: ChatMessage['role']) => {
    if (role === 'user') return <User className="w-3 h-3 text-[#006aff]" />;
    if (role === 'assistant') return <Bot className="w-3 h-3 text-emerald-400" />;
    return <Cog className="w-3 h-3 text-amber-400" />;
  };

  const dropdown =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            id="xv-terminal-search-portal"
            className="fixed rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl overflow-hidden xv-terminal-search-dropdown"
            style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 280 }}
          >
            <div className="px-3 py-2 border-b border-[var(--card-border)]/40 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Chats & commands</p>
              <span className="text-[9px] text-[var(--muted)]">{filtered.length} items</span>
            </div>
            <ul className="overflow-y-auto" style={{ maxHeight: `calc(${VISIBLE_ROWS} * 2.75rem)` }}>
              {shown.length === 0 ? (
                <li className="px-3 py-4 text-[10px] text-center text-[var(--muted)]">
                  {messages.length === 0 ? 'No messages yet' : 'No matches — try different words'}
                </li>
              ) : (
                shown.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => jump(entry.messageId)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/10 transition-colors border-b border-[var(--card-border)]/20 last:border-0',
                        searchHit === entry.messageId && 'bg-[#006aff]/10'
                      )}
                    >
                      <span className="shrink-0 w-6 h-6 rounded-md bg-white/5 flex items-center justify-center">
                        {roleIcon(entry.role)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold truncate text-[var(--foreground)]">{entry.title}</p>
                        <p className="text-[9px] text-[var(--muted)] capitalize">
                          {entry.role === 'user' ? 'Your command' : entry.role === 'assistant' ? 'AI response' : 'Swarm'}
                        </p>
                      </div>
                      <span className="text-[9px] font-mono text-[var(--muted)] shrink-0 tabular-nums">
                        {formatTerminalSearchTime(entry.createdAt)}
                      </span>
                      <ChevronRight className="w-3 h-3 text-[var(--muted)] shrink-0 opacity-50" />
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={wrapRef} className={cn('relative', compact ? 'min-w-0 max-w-[108px]' : 'min-w-[120px] max-w-[200px] lg:max-w-[240px]')}>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-lg border transition-colors',
          open ? 'border-[#006aff]/50 bg-white/10' : 'border-transparent hover:bg-white/5'
        )}
      >
        {compact ? (
          <button
            type="button"
            onClick={() => {
              setOpen((v) => !v);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="p-1 text-[var(--muted)] hover:text-[var(--foreground)] sm:hidden"
            aria-label="Search terminal history"
          >
            <Search className="w-4 h-4" />
          </button>
        ) : null}
        {!compact && <Search className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && shown[0]) jump(shown[0].messageId);
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={compact ? 'Search' : 'Search terminal…'}
          className={cn(
            'xv-terminal-search-input min-w-0 text-[10px] bg-transparent border-none outline-none text-[var(--foreground)] placeholder:text-[var(--muted)]',
            compact ? 'hidden sm:block w-full' : 'w-full'
          )}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setOpen(true);
            }}
            className="p-0.5 text-[var(--muted)]"
            aria-label="Clear search"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {dropdown}
    </div>
  );
}
