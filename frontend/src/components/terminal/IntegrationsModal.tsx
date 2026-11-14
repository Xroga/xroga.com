'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Loader2, Search, X } from 'lucide-react';
import { AnchoredPortalPopover } from '@/components/ui/AnchoredPortalPopover';
import { PluginBrandLogo } from '@/components/integrations/PluginBrandLogo';
import { api } from '@/lib/api';
import { canonicalPluginId } from '@/lib/pluginCatalog';
import { xrogaConnect, type XrogaConnectCatalogToolkit, type XrogaConnectToolkit } from '@/lib/xrogaConnect';
import styles from './PluginsMenu.module.css';

type NativeApp = { slug: string; name: string; connected: boolean; checking: boolean; warning?: string };
type AppRow = { slug: string; name: string; logo?: string; description?: string; connected: boolean; source: 'native' | 'catalog'; noAuth?: boolean };
type View = 'explore' | 'connected';

const nativeNames = ['GitHub', 'Vercel', 'Supabase'] as const;
const nativeSlugs = ['github', 'vercel', 'supabase'] as const;
const keyFor = (value: string) => canonicalPluginId(value);

function nativeApp(name: typeof nativeNames[number], slug: typeof nativeSlugs[number], connected: boolean, checking = false, warning?: string): NativeApp {
  return { slug, name, connected, checking, warning };
}

/** Real catalog and real owner-scoped connection status, inside one anchored menu. */
export function IntegrationsModal({ open, onClose, anchorRef, onSelect }: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  onSelect?: (app: { id: string; name: string }) => void;
}) {
  const [view, setView] = useState<View>('explore');
  const [query, setQuery] = useState('');
  const [native, setNative] = useState<NativeApp[]>([]);
  const [connected, setConnected] = useState<XrogaConnectToolkit[]>([]);
  const [catalog, setCatalog] = useState<XrogaConnectCatalogToolkit[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const requestRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setView('explore');
    setQuery('');
    setAvailable(null);
    setLoadingStatus(true);
    setConnected([]);
    setConnectionError('');
    setNative([nativeApp('GitHub','github',false,true),nativeApp('Vercel','vercel',false,true),nativeApp('Supabase','supabase',false,true)]);
    void Promise.allSettled([api.github.status(), api.vercel.status(), api.supabase.status(), xrogaConnect.status()])
      .then(async (results) => {
        if (!active) return;
        setNative([
          nativeApp('GitHub', 'github', results[0].status === 'fulfilled' && Boolean(results[0].value.connected), false, results[0].status === 'rejected' ? 'Status unavailable' : undefined),
          nativeApp('Vercel', 'vercel', results[1].status === 'fulfilled' && Boolean(results[1].value.connected) && results[1].value.tokenValid !== false, false, results[1].status === 'rejected' ? 'Status unavailable' : results[1].status === 'fulfilled' && results[1].value.tokenValid === false ? 'Needs reconnection' : undefined),
          nativeApp('Supabase', 'supabase', results[2].status === 'fulfilled' && Boolean(results[2].value.connected), false, results[2].status === 'rejected' ? 'Status unavailable' : undefined),
        ]);
        if (results[3].status !== 'fulfilled' || !results[3].value.configured) {
          setAvailable(false);
          setConnectionError('Connected-app service is unavailable. Native connections still work.');
          return;
        }
        setAvailable(true);
        try {
          const session = await xrogaConnect.session();
          const result = await xrogaConnect.toolkits(session.sessionId, { connectedOnly: true });
          if (active) setConnected((result.toolkits ?? []).filter(item => item.connected));
        } catch {
          if (active) setConnectionError('Could not check connected apps. Retry by reopening this menu.');
        }
      })
      .finally(() => { if (active) setLoadingStatus(false); });
    return () => { active = false; };
  }, [open]);

  // Search is server-backed, not restricted to the initial popular apps.
  useEffect(() => {
    if (!open) return;
    const requestId = ++requestRef.current;
    let active = true;
    setCatalog([]);
    setCursor(undefined);
    setCatalogError('');
    setLoadingCatalog(true);
    const timer = window.setTimeout(() => {
      void xrogaConnect.catalog({ search: query.trim() || undefined, sortBy: 'usage', limit: 50 })
        .then(page => {
          if (!active || requestRef.current !== requestId) return;
          setCatalog(page.items ?? []);
          setCursor(page.nextCursor);
        })
        .catch(() => {
          if (!active || requestRef.current !== requestId) return;
          setCatalogError('Catalog search is unavailable. Try again or open the app directory.');
        })
        .finally(() => {
          if (active && requestRef.current === requestId) setLoadingCatalog(false);
        });
    }, query.trim() ? 260 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [open, query]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    const requestId = requestRef.current;
    const next = cursor;
    setLoadingMore(true);
    try {
      const result = await xrogaConnect.catalog({ search: query.trim() || undefined, sortBy: 'usage', limit: 50, cursor: next });
      if (requestId !== requestRef.current) return;
      setCatalog(previous => {
        const seen = new Set(previous.map(item => item.slug));
        return [...previous, ...(result.items ?? []).filter(item => !seen.has(item.slug))];
      });
      setCursor(result.nextCursor);
    } catch {
      if (requestId === requestRef.current) setCatalogError('Additional apps could not be loaded. Try again.');
    } finally {
      setLoadingMore(false);
    }
  }

  const rows = useMemo(() => {
    const byKey = new Map<string, AppRow>();
    for (const item of catalog) byKey.set(keyFor(item.slug), {
      slug: item.slug, name: item.name || item.slug, logo: item.logo,
      description: item.description, connected: false, source: 'catalog', noAuth: item.noAuth,
    });
    // Show connected apps even when not present in the first catalog page.
    for (const item of connected) {
      const key = keyFor(item.toolkit);
      if (nativeSlugs.some(slug => slug === key)) continue;
      const current = byKey.get(key);
      byKey.set(key, {
        slug: item.toolkit, name: item.name || current?.name || item.toolkit,
        logo: item.logo || current?.logo, description: item.description || current?.description,
        connected: item.connected, source: 'catalog', noAuth: item.noAuth,
      });
    }
    for (const item of native) byKey.set(item.slug, {
      slug: item.slug, name: item.name, connected: item.connected, source: 'native',
      description: item.warning,
    });
    const term = query.trim().toLowerCase();
    const tokens = term.split(/\s+/).filter(Boolean);
    return [...byKey.values()].filter(item => view === 'connected' ? item.connected : true)
      .filter(item => !tokens.length || (view === 'explore' && item.source === 'catalog' && catalog.some(result => result.slug === item.slug)) || tokens.every(token => (item.name + ' ' + item.slug + ' ' + (item.description || '')).toLowerCase().includes(token)))
      .sort((a,b) => (a.connected === b.connected ? a.name.localeCompare(b.name) : a.connected ? -1 : 1));
  }, [catalog, connected, native, query, view]);

  const connectedCount = native.filter(item => item.connected).length + connected.filter(item => item.connected && !nativeSlugs.some(slug => keyFor(item.toolkit) === slug)).length;
  const isSearching = Boolean(query.trim());
  const showResults = rows.filter(item => view === 'connected' || isSearching || item.source === 'native' || catalog.some(c => c.slug === item.slug)).slice(0, 100);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-app-item]') ?? [])];
    if (event.key === 'Escape') { if (view === 'connected') { event.preventDefault(); setView('explore'); } else onClose(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!items.length) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement as HTMLElement);
      const next = event.key === 'ArrowDown' ? (index + 1) % items.length : (index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length);
      items[next].focus();
      items[next].scrollIntoView({block:'nearest'});
    }
  }

  if (!open) return null;
  return <AnchoredPortalPopover open={open} onClose={onClose} anchorRef={anchorRef}
    placement="top-start" width={350} className={styles.menu} ariaLabel="Connect Apps">
    <section className={styles.panel} role="dialog" aria-label="Connect Apps" onKeyDown={handleKeyDown}>
      <header className={styles.header}>
        <span>{view === 'connected' ? <button type="button" className={styles.iconButton} onClick={() => setView('explore')} aria-label="Back to app directory"><ArrowLeft size={16}/></button> : null}<strong>{view === 'connected' ? 'Connected Apps' : 'Connect Apps'}</strong></span>
        <button type="button" className={styles.iconButton} aria-label="Close Connect Apps" onClick={onClose}><X size={15}/></button>
      </header>
      <div className={styles.tabs}>
        <button type="button" aria-pressed={view === 'explore'} onClick={() => {setView('explore'); inputRef.current?.focus();}}>Discover apps</button>
        <button type="button" aria-pressed={view === 'connected'} onClick={() => {setView('connected'); setQuery('');}}>Connected {loadingStatus ? '…' : connectedCount}</button>
      </div>
      <label className={styles.search}><Search size={15} aria-hidden="true"/>
        <input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} placeholder={view === 'connected' ? 'Search your connected apps…' : 'Search all supported apps…'} aria-label={view === 'connected' ? 'Search connected apps' : 'Search supported apps'} />
        {query ? <button className={styles.iconButton} type="button" onClick={() => {setQuery(''); inputRef.current?.focus();}} aria-label="Clear search"><X size={13}/></button> : null}
      </label>
      <div className={styles.items} ref={listRef} aria-label={view === 'connected' ? 'Your connected apps' : 'Available apps'}>
        {showResults.map(app => {
          const content = <>
            <PluginBrandLogo id={keyFor(app.slug)} name={app.name} toolkit={app.slug} logo={app.logo} size="micro"/>
            <span className={styles.appText}><strong>{app.name}</strong><small>{app.connected ? 'Connected' : app.noAuth ? 'No connection required' : app.description || 'Connect to use Xroga tools'}</small></span>
            {app.connected ? <Check size={14} className={styles.checked} aria-hidden="true"/> : <ArrowRight size={14} aria-hidden="true"/>}
          </>;
          const selectConnected = app.connected && onSelect;
          return selectConnected
            ? <button data-app-item key={app.slug} type="button" className={styles.item} onClick={() => {onSelect({id:keyFor(app.slug),name:app.name});onClose();}} aria-label={'Use '+app.name}>{content}</button>
            : <Link data-app-item key={app.slug} className={styles.item} href={'/dashboard/integrations/'+encodeURIComponent(app.slug)} onClick={onClose} aria-label={(app.connected ? 'Manage ' : 'Connect ')+app.name}>{content}</Link>;
        })}
        {(loadingCatalog && view === 'explore' || loadingStatus) && <p className={styles.note}><Loader2 size={14} className="animate-spin"/> {view === 'connected' ? 'Checking your connections…' : 'Searching the live app directory…'}</p>}
        {!loadingCatalog && !loadingStatus && showResults.length === 0 && <p className={styles.note}>{view === 'connected' ? 'No connected apps found.' : isSearching ? 'No matching apps found.' : 'No apps available.'}</p>}
        {catalogError && view === 'explore' && <p role="status" className={styles.error}>{catalogError}</p>}
        {available === false && view === 'explore' && <p role="status" className={styles.note}>The connected-app service is unavailable. Native apps are still shown.</p>}
        {connectionError && view === 'connected' && <p role="status" className={styles.error}>{connectionError}</p>}
        {view === 'explore' && cursor && !loadingCatalog && <button type="button" className={styles.loadMore} disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? <Loader2 size={13} className="animate-spin"/> : <ChevronDown size={14}/>} Load more apps</button>}
      </div>
      <footer className={styles.footer}>
        <Link href="/dashboard/integrations" onClick={onClose}>Open full app directory <ArrowRight size={14}/></Link>
      </footer>
    </section>
  </AnchoredPortalPopover>;
}
