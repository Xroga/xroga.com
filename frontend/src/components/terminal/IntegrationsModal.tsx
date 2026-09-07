'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  ChevronDown,
  Plug,
  Search,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';

import {
  INTEGRATIONS,
  INTEGRATION_CATEGORIES,
} from '@/lib/integrations';

import { IntegrationLogo } from '@/components/integrations/IntegrationLogo';
import { isConnectableIntegration } from '@/lib/connectableIntegrations';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

interface IntegrationsModalProps {
  open: boolean;
  onClose: () => void;
}

export function IntegrationsModal({
  open,
  onClose,
}: IntegrationsModalProps) {
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [checking, setChecking] = useState(false);
  const [connectingGithub, setConnectingGithub] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    let active = true;

    setChecking(true);

    void Promise.allSettled([
      api.github.status(),
      api.vercel.status(),
      api.supabase.status(),
    ]).then((results) => {
      if (!active) return;

      setConnected({
        github:
          results[0].status === 'fulfilled' &&
          Boolean(results[0].value.connected),

        vercel:
          results[1].status === 'fulfilled' &&
          Boolean(results[1].value.connected),

        supabase:
          results[2].status === 'fulfilled' &&
          Boolean(results[2].value.connected),
      });

      setChecking(false);
    });

    return () => {
      active = false;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();

    if (!query) {
      return INTEGRATIONS;
    }

    return INTEGRATIONS.filter(
      (integration) =>
        integration.name
          .toLowerCase()
          .includes(query) ||
        integration.category
          .toLowerCase()
          .includes(query),
    );
  }, [search]);

  const liveFiltered = useMemo(
    () =>
      filtered.filter((integration) =>
        isConnectableIntegration(integration.id),
      ),
    [filtered],
  );

  const comingSoonFiltered = useMemo(
    () =>
      filtered.filter(
        (integration) =>
          !isConnectableIntegration(integration.id),
      ),
    [filtered],
  );

  async function handleConnect(
    id: string,
    name: string,
  ) {
    if (!isConnectableIntegration(id)) {
      toast('Coming soon', {
        icon: '⏳',
      });

      return;
    }

    if (connected[id]) {
      onClose();
      router.push('/dashboard/integrations');
      return;
    }

    try {
      if (id === 'github') {
        setConnectingGithub(true);

        const { url } =
          await api.github.oauthUrl();

        if (!url) {
          throw new Error(
            'GitHub authorization is not available.',
          );
        }

        window.location.href = url;
        return;
      }

      if (id === 'vercel') {
        const {
          url,
          oauthConfigured,
        } = await api.vercel.oauthUrl();

        if (!oauthConfigured || !url) {
          throw new Error(
            'Vercel authorization is not configured.',
          );
        }

        window.location.href = url;
        return;
      }

      if (id === 'supabase') {
        const {
          url,
          oauthConfigured,
          message,
        } = await api.supabase.oauthUrl();

        if (!oauthConfigured || !url) {
          throw new Error(
            message ||
              'Supabase authorization is not configured.',
          );
        }

        window.location.href = url;
        return;
      }

      onClose();
      router.push('/dashboard/integrations');
    } catch (error) {
      setConnectingGithub(false);

      toast.error(
        error instanceof Error
          ? error.message
          : `Could not connect ${name}`,
      );
    }
  }

  if (!open) {
    return null;
  }

  /*
   * Do not flash the entire integration catalogue while
   * GitHub connection status is being checked.
   */
  if (checking) {
    return (
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center p-4 modal-backdrop"
        onClick={onClose}
      >
        <div
          className="w-full max-w-sm rounded-2xl modal-glass universe-fade-in p-6 text-center"
          onClick={(event) =>
            event.stopPropagation()
          }
          role="dialog"
          aria-modal="true"
          aria-label="Checking GitHub connection"
        >
          <p className="text-sm text-[var(--muted)]">
            Checking your workspace…
          </p>
        </div>
      </div>
    );
  }

  /*
   * Beginner state:
   *
   * GitHub is the only integration exposed before the
   * user's first connection.
   */
  if (!connected.github) {
    return (
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center p-4 modal-backdrop"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md rounded-2xl modal-glass universe-fade-in overflow-hidden"
          onClick={(event) =>
            event.stopPropagation()
          }
          role="dialog"
          aria-modal="true"
          aria-labelledby="xv-github-start-title"
        >
          <div className="flex justify-end px-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 hover:bg-white/10"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-6 pb-7 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
              <IntegrationLogo
                id="github"
                name="GitHub"
                size={30}
              />
            </div>

            <h2
              id="xv-github-start-title"
              className="text-xl font-semibold"
            >
              Start with GitHub
            </h2>

            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">
              Connect GitHub so Xroga can create,
              save, and update the projects you build.
            </p>

            <button
              type="button"
              onClick={() =>
                void handleConnect(
                  'github',
                  'GitHub',
                )
              }
              disabled={connectingGithub}
              className="mt-6 w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold transition-opacity disabled:opacity-60"
            >
              {connectingGithub
                ? 'Connecting GitHub…'
                : 'Connect GitHub'}
            </button>

            <p className="mt-3 text-xs text-[var(--muted)]">
              You can connect deployment, database,
              and other services later.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /*
   * GitHub connected:
   *
   * Show the existing experienced-user integration manager.
   */
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 modal-backdrop"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] rounded-2xl modal-glass universe-fade-in flex flex-col overflow-hidden"
        onClick={(event) =>
          event.stopPropagation()
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="xv-integrations-modal-title"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <h2
            id="xv-integrations-modal-title"
            className="font-semibold text-base"
          >
            Integrations
          </h2>

          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"
              aria-hidden="true"
            />

            <input
              autoFocus
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search integrations..."
              className="w-full rounded-xl bg-white/5 py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/40"
            />
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-white/10"
            aria-label="Close integrations"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {INTEGRATION_CATEGORIES.map((category) => {
            const items =
              liveFiltered.filter(
                (integration) =>
                  integration.category ===
                  category,
              );

            if (!items.length) {
              return null;
            }

            return (
              <div key={category}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  {category}
                </p>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {items.map((item) => {
                    const isConnected =
                      connected[item.id] === true;

                    return (
                      <div
                        key={item.id}
                        className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.04] p-3 transition-colors hover:bg-white/[0.07]"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/10">
                            <IntegrationLogo
                              id={item.id}
                              name={item.name}
                              size={22}
                              className="object-contain"
                            />

                            {isConnected ? (
                              <CheckCircle2
                                className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-[var(--card)] text-emerald-500"
                                aria-label="Connected"
                              />
                            ) : null}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {item.name}
                            </p>

                            <p className="text-[10px] text-[var(--muted)]">
                              {isConnected
                                ? 'Connected'
                                : 'Available'}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            void handleConnect(
                              item.id,
                              item.name,
                            )
                          }
                          className="relative z-[1] flex shrink-0 items-center gap-1 rounded-lg border border-[var(--accent)]/35 bg-[var(--accent)]/15 px-2.5 py-1.5 text-[10px] font-bold text-[var(--foreground)] transition-colors hover:bg-[var(--accent)]/25"
                        >
                          <Plug className="h-3 w-3" />

                          {isConnected
                            ? 'Manage'
                            : 'Connect'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {comingSoonFiltered.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-white/[0.06]">
              <button
                type="button"
                onClick={() =>
                  setComingSoonOpen(
                    (current) => !current,
                  )
                }
                aria-expanded={comingSoonOpen}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-white/[0.03]"
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Coming soon (
                  {comingSoonFiltered.length})
                </span>

                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 text-[var(--muted)] transition-transform',
                    comingSoonOpen &&
                      'rotate-180',
                  )}
                  aria-hidden="true"
                />
              </button>

              {comingSoonOpen ? (
                <div className="flex flex-wrap gap-1.5 border-t border-white/[0.06] p-3">
                  {comingSoonFiltered.map(
                    (item) => (
                      <span
                        key={item.id}
                        className="rounded-md bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]"
                      >
                        {item.name}
                      </span>
                    ),
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col items-center justify-center gap-2 border-t border-white/10 px-5 py-3 sm:flex-row">
          <Link
            href="/dashboard/integrations"
            onClick={onClose}
            className="w-full rounded-xl border border-[var(--accent)]/35 bg-[var(--accent)]/20 px-4 py-2 text-center text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--accent)]/30 sm:w-auto"
          >
            Open Integrations tab →
          </Link>
        </div>
      </div>
    </div>
  );
}
