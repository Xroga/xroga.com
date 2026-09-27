'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Plug, X } from 'lucide-react';

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

  useEffect(() => {
    if (!open) return;

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

  const plugins = useMemo(() => [...native, ...apps], [native, apps]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[460] flex items-end justify-center bg-black/50 p-3 sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-plugins-title"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-5 py-4">
          <div>
            <h2 id="workspace-plugins-title" className="text-base font-semibold text-[var(--text-primary)]">
              Plugins
            </h2>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              Quick connection status. Open Plugins for discovery, capabilities and account management.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Plugins"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="max-h-[60vh] overflow-y-auto p-3">
          <div className="space-y-1.5">
            {plugins.map((plugin) => (
              <Link
                key={plugin.id}
                href={`/dashboard/integrations/${plugin.id}`}
                onClick={onClose}
                className="flex min-h-12 items-center gap-3 rounded-xl border border-transparent px-3 py-2 transition hover:border-[var(--border-subtle)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-inset)]">
                  <IntegrationLogo id={plugin.id} name={plugin.name} size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm text-[var(--text-primary)]">{plugin.name}</strong>
                  <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
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
                  </span>
                </span>
              </Link>
            ))}

            {loadingApps && !apps.length ? (
              <div className="flex min-h-12 items-center gap-2 px-3 text-xs text-[var(--text-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Checking business Plugins…
              </div>
            ) : null}
          </div>
        </div>

        <footer className="border-t border-[var(--border-subtle)] p-3">
          <Link
            href="/dashboard/integrations"
            onClick={onClose}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white"
          >
            <Plug className="h-4 w-4" aria-hidden="true" />
            Manage Plugins
          </Link>
        </footer>
      </section>
    </div>
  );
}
