'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen, Layers, MessageSquare, Search, X } from 'lucide-react';
import { useWorkspaceIdentity } from './WorkspaceIdentityContext';
import type { WorkspaceSearchResult } from '@/lib/workspaceSearchIndex';
import { workspaceSearchTerms } from '@/lib/workspaceSearchQuery';
import styles from './SidebarSearchModal.module.css';

const labels = { chat: 'Chat', project: 'Project', section: 'Project section' } as const;
const icons = { chat: MessageSquare, project: FolderOpen, section: Layers } as const;
type ResultState = { key: string; items: WorkspaceSearchResult[]; failed: boolean };
type Props = { open: boolean; onClose: () => void };

export function SidebarSearchModal({ open, onClose }: Props) {
  const { status, userId } = useWorkspaceIdentity();
  const owner = status === 'authenticated' && userId ? userId : null;
  if (!open) return null;
  return <SearchPanel key={owner ?? 'guest'} owner={owner} onClose={onClose} />;
}

function SearchPanel({ owner, onClose }: { owner: string | null; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const helperId = useId();
  const [query, setQuery] = useState('');
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<ResultState | null>(null);
  const normalized = workspaceSearchTerms(query).join(' ');
  const canSearch = !query.trim() || normalized.length >= 2;
  const key = JSON.stringify([normalized, retry]);
  const current = result?.key === key ? result : null;

  useEffect(() => {
    const returnFocus = document.activeElement;
    input.current?.focus();
    return () => { if (returnFocus instanceof HTMLElement) returnFocus.focus(); };
  }, []);

  useEffect(() => {
    if (!owner || !canSearch) return;
    const stop = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const { searchOwnedWorkspace } = await import('@/lib/workspaceSearch');
        if (stop.signal.aborted) return;
        const items = await searchOwnedWorkspace(owner, normalized ? normalized.split(' ') : [], stop.signal);
        if (!stop.signal.aborted) setResult({ key, items, failed: false });
      } catch {
        if (!stop.signal.aborted) setResult({ key, items: [], failed: true });
      }
    }, normalized ? 240 : 0);
    return () => { window.clearTimeout(timer); stop.abort(); };
  }, [owner, canSearch, normalized, key]);

  function handleKeys(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    const links = [...(dialog.current?.querySelectorAll<HTMLAnchorElement>('[data-workspace-search-result]') ?? [])];
    if (event.key === 'Enter' && event.target === input.current && links.length) {
      event.preventDefault();
      links[0].click();
      return;
    }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && links.length) {
      event.preventDefault();
      const active = links.findIndex(link => link === document.activeElement);
      if (event.key === 'ArrowUp' && active === 0) { input.current?.focus(); return; }
      const next = active === -1 ? (event.key === 'ArrowDown' ? 0 : links.length - 1)
        : (active + (event.key === 'ArrowDown' ? 1 : -1)) % links.length;
      links[next]?.focus();
      return;
    }
    if (event.key === 'Tab') {
      const focusable = dialog.current?.querySelectorAll<HTMLElement>('input, button:not([disabled]), a[href]');
      if (!focusable?.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }

  return createPortal(
    <div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialog} role="dialog" aria-modal="true" aria-label="Search workspace" className={styles.dialog} onKeyDown={handleKeys}>
        <div className={styles.bar}>
          <Search size={17} aria-hidden="true" />
          <input ref={input} type="search" aria-label="Search chats, projects and sections" aria-describedby={helperId}
            value={query} onChange={event => setQuery(event.target.value)} placeholder="Search chats, projects and sections…" maxLength={120} />
          <button type="button" onClick={onClose} aria-label="Close search"><X size={17} aria-hidden="true" /></button>
        </div>
        <div className={styles.results} aria-busy={Boolean(owner && canSearch && !current)}>
          {!owner ? <p><a href="/auth/login?next=%2Fworkspace">Sign in</a> to search your saved work.</p>
            : !canSearch ? <p role="status">Enter at least two letters or numbers.</p>
            : !current ? <p role="status">Searching saved work…</p>
            : current.failed ? <div role="alert"><p>Search is temporarily unavailable.</p><button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></div>
            : !current.items.length ? <p role="status">{normalized ? 'No matching saved work.' : 'No saved work yet.'}</p>
            : <>
              <p className={styles.summary} role="status">{normalized ? `${current.items.length} results` : 'Recently saved'}</p>
              <ul>{current.items.map(item => {
                const Icon = icons[item.kind];
                return <li key={`${item.kind}:${item.id}`}>
                  <a className={styles.result} data-workspace-search-result href={item.href} onClick={onClose}>
                    <Icon size={17} aria-hidden="true" />
                    <span><strong>{item.title}</strong>{item.detail ? <small>{item.detail}</small> : null}</span>
                    <span className={styles.kind}>{labels[item.kind]}</span>
                  </a>
                </li>;
              })}</ul>
            </>}
        </div>
        <p id={helperId} className={styles.hint}>↑ ↓ to navigate <span>Enter to open · Esc to close</span></p>
      </section>
    </div>, document.body,
  );
}
