'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
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

const APP_IDS = ['gmail', 'slack', 'notion'] as const;

export function IntegrationsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [native, setNative] = useState<ModalPlugin[]>([]);
  const [apps, setApps] = useState<ModalPlugin[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;

    setQuery('');

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

    setLoadingApps(true);
    void xrogaConnect
      .status()
      .then(async (status) => {
        if (!active || !status.configured) return;
        const result = await xrogaConnect.search(POPULAR_HYDRATION_QUERY);
        if (!active) return;

        const map = new Map(
          (result.toolkits ?? []).map((toolkit) => [
            canonicalPluginId(`${toolkit.name ?? ''} ${toolkit.toolkit}`),
            toolkit,
          ]),
        );

        setApps(
          APP_IDS.map((id) => ({
            id,
            name: id === 'gmail' ? 'Gmail' : id === 'slack' ? 'Slack' : 'Notion',
            connected: Boolean(map.get(id)?.connected || map.get(id)?.noAuth),
          })),
        );
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

  const plugins = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const all = [...native, ...apps];
    return normalized
      ? all.filter((plugin) => plugin.name.toLowerCase().includes(normalized))
      : all;
  }, [native, apps, query]);

  if (!open) return null;

  return (
    <div
      className="xv-plugins-popover-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
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
              autoFocus
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
            {plugins.map((plugin) => (
              <Link
                key={plugin.id}
                href={`/dashboard/integrations/${plugin.id}`}
                onClick={onClose}
                className="xv-plugins-popover__item"
              >
                <span className="xv-plugins-popover__logo">
                  <IntegrationLogo id={plugin.id} name={plugin.name} size={16} />
                </span>
                <span className="xv-plugins-popover__name">
                  <strong>{plugin.name}</strong>
                  <small>
                    {plugin.checking ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                        Checking
                      </>
                    ) : plugin.connected ? (
                      <>
                        <Check className="h-3 w-3 text-[var(--accent)]" aria-hidden="true" />
                        Connected
                      </>
                    ) : (
                      'Available'
                    )}
                  </small>
                </span>
                <Plus aria-hidden="true" className="xv-plugins-popover__plus" />
              </Link>
            ))}

            {loadingApps && !apps.length ? (
              <div className="xv-plugins-popover__loading">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Checking business Plugins…
              </div>
            ) : null}
            {!loadingApps && plugins.length === 0 ? (
              <p className="xv-plugins-popover__empty">No matching plugins.</p>
            ) : null}
          </div>

          <aside className="xv-plugins-popover__aside">
            <p className="xv-plugins-popover__eyebrow">Manage</p>
            <strong>Connect more tools</strong>
            <span>Browse capabilities and choose which accounts Xroga may use.</span>
            <Link
              href="/dashboard/integrations"
              onClick={onClose}
              className="xv-plugins-popover__browse"
            >
              Manage Plugins · Browse all
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </aside>
        </div>
      </section>
    </div>
  );
}
