'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { AnchoredPortalPopover } from '@/components/ui/AnchoredPortalPopover';
import compactStyles from './PluginsMenu.module.css';
import { ArrowUpRight, Check, Loader2, Plus, Search, X } from 'lucide-react';

import { IntegrationLogo } from '@/components/integrations/IntegrationLogo';
import { api } from '@/lib/api';
import { canonicalPluginId, POPULAR_HYDRATION_QUERY } from '@/lib/pluginCatalog';
import { xrogaConnect } from '@/lib/xrogaConnect';

type ModalPlugin = {
  id: string;
  name: string;
  connected: boolean;
  checking?: boolean;
};


export function IntegrationsModal({
  open,
  onClose,
  anchorRef,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  onSelect?: (plugin: { id: string; name: string }) => void;
}) {
  const [native, setNative] = useState<ModalPlugin[]>([]);
  const [apps, setApps] = useState<ModalPlugin[]>([]);
  const [catalogMatches, setCatalogMatches] = useState<ModalPlugin[]>([]);
  const [catalogSearching, setCatalogSearching] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const [loadingApps, setLoadingApps] = useState(false);
  const [query, setQuery] = useState('');
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!open) return;

    setQuery('');
    setConnecting(false);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    let active = true;

    setNative([
      { id: 'github', name: 'GitHub', connected: false, checking: true },
      { id: 'vercel', name: 'Vercel', connected: false, checking: true },
      { id: 'supabase', name: 'Supabase', connected: false, checking: true },
    ]);

    void Promise.allSettled([
      api.github.status(),
      api.vercel.status(),
      api.supabase.status(),
    ]).then((results) => {
      if (!active) return;
      setNative([
        {
          id: 'github',
          name: 'GitHub',
          connected: results[0].status === 'fulfilled' && Boolean(results[0].value.connected),
        },
        {
          id: 'vercel',
          name: 'Vercel',
          connected: results[1].status === 'fulfilled' && Boolean(results[1].value.connected),
        },
        {
          id: 'supabase',
          name: 'Supabase',
          connected: results[2].status === 'fulfilled' && Boolean(results[2].value.connected),
        },
      ]);
    });

    setApps([]);
    setLoadingApps(true);
    void xrogaConnect
      .status()
      .then(async (status) => {
        if (!active || !status.configured) return;
        const result = await xrogaConnect.search(POPULAR_HYDRATION_QUERY);
        if (!active) return;

        const available = new Map<string, ModalPlugin>();
        for (const toolkit of result.toolkits ?? []) {
          const id = canonicalPluginId(`${toolkit.name ?? ''} ${toolkit.toolkit}`);
          if (!id || ['github', 'vercel', 'supabase'].includes(id)) continue;
          available.set(id, { id, name: toolkit.name || toolkit.toolkit, connected: Boolean(toolkit.connected) });
        }
        setApps(Array.from(available.values()));
      })
      .catch(() => {
        if (active) setApps([]);
      })
      .finally(() => {
        if (active) setLoadingApps(false);
      });

    return () => {
      active = false;
    };
  }, [open]);

  // Search the complete supported catalog, not only the few hydrated popular apps.
  // Debounced and abort-safe: a slow previous query cannot replace a newer result.
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setCatalogMatches([]);
      setCatalogSearching(false);
      setCatalogError(false);
      return;
    }
    let cancelled = false;
    setCatalogSearching(true);
    setCatalogError(false);
    const timer = window.setTimeout(() => {
      void xrogaConnect.catalog({ search: query.trim(), limit: 25 })
        .then(result => {
          if (cancelled) return;
          const matches = (result.items ?? []).map(item => ({
            id: canonicalPluginId(item.slug) || item.slug,
            name: item.name || item.slug,
            connected: false,
          }));
          setCatalogMatches(matches);
        })
        .catch(() => {
          if (cancelled) return;
          setCatalogMatches([]);
          setCatalogError(true);
        })
        .finally(() => { if (!cancelled) setCatalogSearching(false); });
    }, 240);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [open, query]);

  const plugins = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const byId = new Map<string, ModalPlugin>();
    // Known connected state always wins over discovery-only catalog metadata.
    for (const item of catalogMatches) byId.set(item.id, item);
    for (const item of apps) byId.set(item.id, item);
    for (const item of native) byId.set(item.id, item);
    const all = [...byId.values()];
    return normalized
      ? all.filter((plugin) => plugin.name.toLowerCase().includes(normalized))
      : [...native, ...apps];
  }, [native, apps, catalogMatches, query]);

  if (!open) return null;

  return (
    <AnchoredPortalPopover open={open} onClose={onClose} anchorRef={anchorRef} placement="top-start" width={260} className={compactStyles.menu} ariaLabel="Plugin shortcuts">
      <section
        role="dialog"
        aria-labelledby="workspace-plugins-title"
        className="xv-plugins-popover"
      >
        <h2 id="workspace-plugins-title" className="sr-only">Plugins</h2>
        <header className="xv-plugins-popover__header">
          <label className="xv-plugins-popover__search">
            <Search aria-hidden="true" />
            <span className="sr-only">Search plugins</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search plugins…"
            />
          </label>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Plugins"
            className="xv-plugins-popover__close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="xv-plugins-popover__body">
          <div className="xv-plugins-popover__primary">
            <p className="xv-plugins-popover__eyebrow">Plugins</p>
            {plugins.map((plugin) => {
              const entry = <>
                <span className="xv-plugins-popover__logo"><IntegrationLogo id={plugin.id} name={plugin.name} size={17} /></span>
                <span className="xv-plugins-popover__name">
                  <strong>{plugin.name}</strong>
                  <small>{plugin.checking ? <><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />Checking</>
                    : plugin.connected ? <><Check className="h-3 w-3" aria-hidden="true" />Connected · select</>
                    : 'Connect to use'}</small>
                </span>
                {plugin.connected && onSelect ? <Check className="xv-plugins-popover__plus" aria-hidden="true" /> : <Plus className="xv-plugins-popover__plus" aria-hidden="true" />}
              </>;
              return plugin.connected && onSelect
                ? <button type="button" key={plugin.id} onClick={() => { onSelect(plugin); onClose(); }}
                    className="xv-plugins-popover__item" aria-label={'Select ' + plugin.name + ' plugin'}>{entry}</button>
                : <Link key={plugin.id} href={`/dashboard/integrations/${plugin.id}`} onClick={onClose}
                    className="xv-plugins-popover__item">{entry}</Link>;
            })}

            {loadingApps && !apps.length ? (
              <div className="xv-plugins-popover__loading">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Checking business Plugins…
              </div>
            ) : null}
            {catalogSearching && query.trim().length >= 2 ? (
              <div className="xv-plugins-popover__loading" role="status">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Searching supported plugins…
              </div>
            ) : null}
            {catalogError && query.trim().length >= 2 ? (
              <p className="xv-plugins-popover__empty">Live plugin search is unavailable. Browse the full catalog below.</p>
            ) : null}
            {!loadingApps && !catalogSearching && !catalogError && plugins.length === 0 ? (
              <p className="xv-plugins-popover__empty">No matching plugins in the catalog.</p>
            ) : null}
          </div>

          <aside className="xv-plugins-popover__aside">
            <button type="button" className={compactStyles.connect} onClick={() => setConnecting(value => !value)} aria-expanded={connecting}>Connect plugins <Plus size={14} /></button>
            {connecting ? <div className={compactStyles.connectList}>{[...native, ...apps].filter(plugin => !plugin.connected).map(plugin => <Link key={plugin.id} href={`/dashboard/integrations/${plugin.id}`} onClick={onClose}><IntegrationLogo id={plugin.id} name={plugin.name} size={16} />{plugin.name}<Plus size={12} /></Link>)}</div> : null}
            <Link
              href="/dashboard/integrations"
              onClick={onClose}
              className="xv-plugins-popover__browse"
            >
              Browse all plugins
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </aside>
        </div>
      </section>
    </AnchoredPortalPopover>
  );
}
