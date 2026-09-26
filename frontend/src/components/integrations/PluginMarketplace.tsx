'use client';

import Link from 'next/link';
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  xrogaConnect,
  type XrogaConnectToolkit,
} from '@/lib/xrogaConnect';
import {
  clearOAuthResult,
  subscribeOAuthResults,
} from '@/lib/oauthPopupResult';
import {
  filterPluginsByCategory,
  mergePlugins,
  PLUGIN_CATEGORIES,
  PLUGIN_SEED,
  pluginMatchesToolkit,
  pluginsFromSearch,
  rankPlugins,
  type MarketplacePlugin,
  type PluginCategory,
} from '@/lib/pluginMarketplace';

import { IntegrationLogo } from '@/components/integrations/IntegrationLogo';
import { ConnectedServicesSection } from '@/components/integrations/ConnectedServicesSection';
import { CustomCredentialsSection } from '@/components/integrations/CustomCredentialsSection';

type MarketplaceView =
  | 'discover'
  | 'connected'
  | 'developer'
  | 'custom';

const VIEWS: Array<{
  id: MarketplaceView;
  label: string;
}> = [
  { id: 'discover', label: 'Discover' },
  { id: 'connected', label: 'Connected' },
  { id: 'developer', label: 'Developer' },
  { id: 'custom', label: 'Custom' },
];

const INITIAL_VISIBLE = 30;

function isMarketplaceView(value: string | null): value is MarketplaceView {
  return VIEWS.some((item) => item.id === value);
}

function PluginStatus({
  plugin,
  checking,
}: {
  plugin: MarketplacePlugin;
  checking?: boolean;
}) {
  if (checking) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Checking
      </span>
    );
  }

  if (plugin.connected) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        Connected
      </span>
    );
  }

  if (plugin.availability === 'unavailable') {
    return (
      <span className="text-xs font-medium text-[var(--text-muted)]">
        Unavailable
      </span>
    );
  }

  if (plugin.availability === 'coming_soon') {
    return (
      <span className="text-xs font-medium text-[var(--text-muted)]">
        Coming soon
      </span>
    );
  }

  return (
    <span className="text-xs font-medium text-[var(--text-muted)]">
      Available
    </span>
  );
}

function PluginCard({
  plugin,
  connecting,
  checking,
  onConnect,
  onPreview,
}: {
  plugin: MarketplacePlugin;
  connecting: boolean;
  checking?: boolean;
  onConnect: (plugin: MarketplacePlugin) => void;
  onPreview: (plugin: MarketplacePlugin) => void;
}) {
  const disabled =
    connecting ||
    plugin.availability !== 'available' ||
    !plugin.connectable;

  const buttonLabel =
    plugin.source === 'credential'
      ? 'Configure'
      : plugin.connected
        ? 'Manage'
        : 'Connect';

  return (
    <article className="group flex min-h-[112px] flex-col rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3 sm:min-h-[142px] sm:p-4 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-subtle motion-reduce:transform-none motion-reduce:transition-none">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onPreview(plugin)}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-token-sm text-left focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          aria-label={`View ${plugin.name} plugin`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white p-1.5 text-black shadow-subtle">
            <IntegrationLogo
              id={plugin.id}
              name={plugin.name}
              size={26}
              src={plugin.logo}
              className="max-h-full max-w-full object-contain"
            />
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
                {plugin.name}
              </span>
              {plugin.connected ? (
                <span className="sr-only">Connected</span>
              ) : null}
            </span>

            <span className="mt-1 block line-clamp-2 text-[13px] leading-5 text-[var(--text-secondary)]">
              {plugin.description}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onConnect(plugin)}
          disabled={disabled}
          className={cn(
            'shrink-0 rounded-token-sm border px-2.5 py-1.5 text-xs font-semibold transition-colors',
            'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50',
            plugin.connected
              ? 'border-[var(--border-subtle)] bg-[var(--surface-inset)] text-[var(--text-primary)] hover:border-[var(--border-strong)]'
              : 'border-[var(--accent)]/35 bg-[var(--accent)]/10 text-[var(--text-primary)] hover:bg-[var(--accent)]/15',
          )}
          aria-label={`${buttonLabel} ${plugin.name}`}
        >
          {connecting ? 'Connecting…' : buttonLabel}
        </button>
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-[var(--text-muted)]">
            {plugin.category}
            {plugin.capabilityCount
              ? ` · ${plugin.capabilityCount} capabilities`
              : ''}
          </p>
          {plugin.statusMessage && plugin.connected ? (
            <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
              {plugin.statusMessage}
            </p>
          ) : null}
        </div>

        <PluginStatus plugin={plugin} checking={checking} />
      </div>
    </article>
  );
}

function PluginGrid({
  plugins,
  connectingId,
  checkingNative,
  onConnect,
  onPreview,
}: {
  plugins: readonly MarketplacePlugin[];
  connectingId: string | null;
  checkingNative: boolean;
  onConnect: (plugin: MarketplacePlugin) => void;
  onPreview: (plugin: MarketplacePlugin) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {plugins.map((plugin) => (
        <PluginCard
          key={plugin.id}
          plugin={plugin}
          connecting={connectingId === plugin.id}
          checking={checkingNative && plugin.source === 'native'}
          onConnect={onConnect}
          onPreview={onPreview}
        />
      ))}
    </div>
  );
}

function SectionHeading({
  title,
  meta,
}: {
  title: string;
  meta?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">
        {title}
      </h2>
      {meta ? (
        <span className="text-xs text-[var(--text-muted)]">{meta}</span>
      ) : null}
    </div>
  );
}

function MarketplaceEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-token-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-raised)] px-5 py-8 text-center">
      <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      <p className="mx-auto mt-1.5 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function PluginPreview({
  plugin,
  connecting,
  onClose,
  onConnect,
}: {
  plugin: MarketplacePlugin;
  connecting: boolean;
  onClose: () => void;
  onConnect: (plugin: MarketplacePlugin) => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="plugin-preview-title"
        className="w-full max-w-lg overflow-hidden rounded-t-[24px] border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-elevated sm:rounded-token-lg"
      >
        <header className="flex items-start gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white p-2 text-black">
            <IntegrationLogo
              id={plugin.id}
              name={plugin.name}
              size={28}
              src={plugin.logo}
              className="max-h-full max-w-full object-contain"
            />
          </span>

          <div className="min-w-0 flex-1">
            <h2
              id="plugin-preview-title"
              className="text-base font-semibold text-[var(--text-primary)]"
            >
              {plugin.name}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              {plugin.category}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-token-sm p-2 text-[var(--text-muted)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            aria-label="Close plugin preview"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="space-y-5 px-5 py-5">
          <p className="text-sm leading-6 text-[var(--text-secondary)]">
            {plugin.description}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                Status
              </p>
              <div className="mt-2">
                <PluginStatus plugin={plugin} />
              </div>
            </div>

            <div className="rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                Access
              </p>
              <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                Xroga uses only the capabilities you authorize. Sensitive actions can require confirmation.
              </p>
            </div>
          </div>

          {plugin.capabilityCount ? (
            <p className="text-xs text-[var(--text-muted)]">
              {plugin.capabilityCount} matching capabilities discovered.
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-token-sm border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              Close
            </button>
            <button
              type="button"
              disabled={
                connecting ||
                plugin.availability !== 'available' ||
                !plugin.connectable
              }
              onClick={() => onConnect(plugin)}
              className="rounded-token-sm bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--background)] transition-opacity disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              {connecting
                ? 'Connecting…'
                : plugin.source === 'credential'
                  ? 'Configure'
                  : plugin.connected
                    ? 'Manage'
                    : `Connect ${plugin.name}`}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function PluginMarketplace() {
  const [view, setViewState] = useState<MarketplaceView>('discover');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [category, setCategory] = useState<PluginCategory | 'All'>('All');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [nativeConnected, setNativeConnected] = useState<Record<string, boolean>>({});
  const [checkingNative, setCheckingNative] = useState(true);
  const [connectConfigured, setConnectConfigured] = useState<boolean | null>(null);
  const [remotePlugins, setRemotePlugins] = useState<MarketplacePlugin[]>([]);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticError, setSemanticError] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [selectedPlugin, setSelectedPlugin] = useState<MarketplacePlugin | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const connectSearchRef = useRef('');
  const requestSequenceRef = useRef(0);

  const setView = (next: MarketplaceView) => {
    setViewState(next);
    setVisibleCount(INITIAL_VISIBLE);

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (next === 'discover') url.searchParams.delete('view');
      else url.searchParams.set('view', next);
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get('view');
    if (isMarketplaceView(requestedView)) {
      setViewState(requestedView);
    }

    const github = params.get('github');
    const vercel = params.get('vercel');
    const supabase = params.get('supabase');
    const composio = params.get('composio');
    const message = params.get('message');

    if (github === 'connected') {
      setNativeConnected((current) => ({ ...current, github: true }));
      toast.success(
        params.get('username')
          ? `GitHub connected as @${params.get('username')}`
          : 'GitHub connected',
      );
    } else if (github === 'error' || github === 'missing_code') {
      toast.error(message || 'GitHub authorization failed — try again');
    }

    if (vercel === 'connected') {
      setNativeConnected((current) => ({ ...current, vercel: true }));
      toast.success(
        params.get('username')
          ? `Vercel connected as @${params.get('username')}`
          : 'Vercel connected',
      );
    } else if (
      vercel === 'error' ||
      vercel === 'missing_code'
    ) {
      toast.error(message || 'Vercel authorization failed — try again');
    }

    if (supabase === 'connected') {
      setNativeConnected((current) => ({ ...current, supabase: true }));
      toast.success('Supabase authorized');
    } else if (
      supabase === 'error' ||
      supabase === 'missing_code'
    ) {
      toast.error(message || 'Supabase authorization failed — try again');
    }

    if (composio === 'connected') {
      toast.success('Plugin connected to Xroga');
    } else if (composio === 'error') {
      toast.error(message || 'Plugin connection failed');
    }

    if (github || vercel || supabase || composio) {
      const url = new URL(window.location.href);
      [
        'github',
        'vercel',
        'supabase',
        'composio',
        'message',
        'username',
        'pick',
        'focus',
      ].forEach((key) => url.searchParams.delete(key));
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    }
  }, []);

  useEffect(() => {
    let active = true;

    setCheckingNative(true);
    void Promise.allSettled([
      api.github.status(),
      api.vercel.status(),
      api.supabase.status(),
    ]).then((results) => {
      if (!active) return;

      setNativeConnected({
        github:
          results[0].status === 'fulfilled' &&
          Boolean(results[0].value.connected),
        vercel:
          results[1].status === 'fulfilled' &&
          Boolean(results[1].value.connected),
        supabase:
          results[2].status === 'fulfilled' &&
          Boolean(
            results[2].value.connected ||
            results[2].value.oauthConnected ||
            results[2].value.provisioned ||
            results[2].value.ready,
          ),
      });
      setCheckingNative(false);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    void xrogaConnect
      .status()
      .then(async (status) => {
        if (!active) return;
        setConnectConfigured(status.configured);

        if (!status.configured) return;

        try {
          const result = await xrogaConnect.search(
            'email calendar files messages payments orders crm pages accounting issues monitoring',
          );
          if (!active) return;

          sessionIdRef.current = result.sessionId;
          setRemotePlugins(
            pluginsFromSearch(result.toolkits ?? [], result.tools ?? []),
          );
        } catch {
          // Bootstrap discovery is best-effort. Native Plugins remain usable.
        }
      })
      .catch(() => {
        if (active) setConnectConfigured(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () =>
      subscribeOAuthResults((payload) => {
        if (payload.type === 'xroga-composio-connected') {
          setConnectingId(null);
          toast.success('Plugin connected to Xroga');

          const last = connectSearchRef.current;
          if (last) {
            void xrogaConnect
              .search(last, sessionIdRef.current ?? undefined)
              .then((result) => {
                sessionIdRef.current = result.sessionId;
                setRemotePlugins((current) =>
                  mergePlugins(
                    current,
                    pluginsFromSearch(result.toolkits ?? [], result.tools ?? []),
                  ),
                );
              })
              .catch(() => {
                // The OAuth succeeded; a refresh can recover metadata later.
              });
          }
        }

        if (payload.type === 'xroga-composio-error') {
          setConnectingId(null);
          toast.error(payload.message || 'Plugin connection failed');
        }
      }),
    [],
  );

  useEffect(() => {
    const clean = deferredQuery.trim();
    if (clean.length < 2 || connectConfigured !== true) {
      setSemanticLoading(false);
      setSemanticError(null);
      return;
    }

    const sequence = ++requestSequenceRef.current;
    const timer = window.setTimeout(() => {
      setSemanticLoading(true);
      setSemanticError(null);

      void xrogaConnect
        .search(clean, sessionIdRef.current ?? undefined)
        .then((result) => {
          if (sequence !== requestSequenceRef.current) return;

          sessionIdRef.current = result.sessionId;
          setRemotePlugins((current) =>
            mergePlugins(
              current,
              pluginsFromSearch(result.toolkits ?? [], result.tools ?? []),
            ),
          );
        })
        .catch((error) => {
          if (sequence !== requestSequenceRef.current) return;
          setSemanticError(
            error instanceof Error
              ? error.message
              : 'Live Plugin search is temporarily unavailable.',
          );
        })
        .finally(() => {
          if (sequence === requestSequenceRef.current) {
            setSemanticLoading(false);
          }
        });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [deferredQuery, connectConfigured]);

  const plugins = useMemo(() => {
    const merged = mergePlugins(PLUGIN_SEED, remotePlugins);

    return merged.map((plugin) => {
      if (plugin.source === 'native') {
        return {
          ...plugin,
          connected: nativeConnected[plugin.id] ?? plugin.connected,
        };
      }

      if (plugin.source === 'composio' && connectConfigured === false) {
        return {
          ...plugin,
          availability: 'unavailable' as const,
          connectable: false,
          statusMessage: 'Business Plugins are temporarily unavailable.',
        };
      }

      return plugin;
    });
  }, [connectConfigured, nativeConnected, remotePlugins]);

  useEffect(() => {
    if (!selectedPlugin) return;

    const fresh = plugins.find((plugin) => plugin.id === selectedPlugin.id);
    if (fresh && fresh !== selectedPlugin) setSelectedPlugin(fresh);
  }, [plugins, selectedPlugin]);

  const connectedPlugins = useMemo(
    () => plugins.filter((plugin) => plugin.connected),
    [plugins],
  );

  const popularPlugins = useMemo(
    () =>
      plugins
        .filter(
          (plugin) =>
            plugin.popular &&
            plugin.availability === 'available',
        )
        .slice(0, 6),
    [plugins],
  );

  const developerPlugins = useMemo(
    () =>
      plugins.filter(
        (plugin) =>
          plugin.developer &&
          plugin.availability === 'available',
      ),
    [plugins],
  );

  const searchResults = useMemo(() => {
    const ranked = rankPlugins(plugins, query);
    const available = ranked.filter(
      (plugin) => plugin.availability !== 'coming_soon',
    );
    return filterPluginsByCategory(available, category);
  }, [category, plugins, query]);

  const allDiscoverPlugins = useMemo(
    () =>
      filterPluginsByCategory(
        plugins.filter(
          (plugin) => plugin.availability === 'available',
        ),
        category,
      ),
    [category, plugins],
  );

  const visiblePlugins = (
    query.trim() ? searchResults : allDiscoverPlugins
  ).slice(0, visibleCount);

  async function connectComposio(plugin: MarketplacePlugin) {
    setConnectingId(plugin.id);
    setSemanticError(null);
    clearOAuthResult();

    const popup = window.open(
      '',
      'xroga-connect-oauth',
      'width=600,height=760,resizable=yes,scrollbars=yes',
    );

    try {
      let sessionId = sessionIdRef.current;
      let toolkit: XrogaConnectToolkit | undefined;

      if (plugin.toolkit && sessionId) {
        toolkit = {
          toolkit: plugin.toolkit,
          name: plugin.name,
          description: plugin.description,
          logo: plugin.logo,
          connected: Boolean(plugin.connected),
        };
      } else {
        const searchText =
          plugin.searchTerms[0] ||
          `find ${plugin.name} capabilities`;

        connectSearchRef.current = searchText;

        const result = await xrogaConnect.search(
          searchText,
          sessionId ?? undefined,
        );

        sessionId = result.sessionId;
        sessionIdRef.current = result.sessionId;

        const discovered = pluginsFromSearch(
          result.toolkits ?? [],
          result.tools ?? [],
        );

        setRemotePlugins((current) =>
          mergePlugins(current, discovered),
        );

        toolkit = (result.toolkits ?? []).find((item) =>
          pluginMatchesToolkit(plugin, item),
        );
      }

      if (!sessionId || !toolkit) {
        throw new Error(
          `${plugin.name} is not currently available through Xroga Connect.`,
        );
      }

      if (toolkit.connected || plugin.connected) {
        try {
          popup?.close();
        } catch {
          // Ignore popup cleanup failures.
        }

        setRemotePlugins((current) =>
          mergePlugins(current, [{ ...plugin, connected: true }]),
        );
        setConnectingId(null);
        toast.success(`${plugin.name} is already connected`);
        setView('connected');
        return;
      }

      connectSearchRef.current =
        plugin.searchTerms[0] ||
        `find ${plugin.name} capabilities`;

      const result = await xrogaConnect.link(
        sessionId,
        toolkit.toolkit,
      );

      if (!result.redirectUrl) {
        throw new Error('Authorization link was not returned.');
      }

      if (popup) {
        popup.location.href = result.redirectUrl;
        popup.focus();
      } else {
        window.location.href = result.redirectUrl;
      }
    } catch (error) {
      try {
        popup?.close();
      } catch {
        // Ignore popup cleanup failures.
      }

      setConnectingId(null);
      toast.error(
        error instanceof Error
          ? error.message
          : `Could not connect ${plugin.name}`,
      );
    }
  }

  async function connectNative(plugin: MarketplacePlugin) {
    if (plugin.connected) {
      setView('developer');
      setSelectedPlugin(null);
      return;
    }

    setConnectingId(plugin.id);

    try {
      if (plugin.id === 'github') {
        const { openGitHubOAuthPopup } = await import('@/lib/githubConnect');
        const result = await openGitHubOAuthPopup();
        if (!result.opened) {
          throw new Error(
            result.error || 'Could not start GitHub authorization.',
          );
        }
        return;
      }

      if (plugin.id === 'vercel') {
        const { openVercelOAuthPopup } = await import('@/lib/vercelConnect');
        const result = await openVercelOAuthPopup();
        if (!result.opened) {
          throw new Error(
            result.error || 'Could not start Vercel authorization.',
          );
        }
        return;
      }

      if (plugin.id === 'supabase') {
        const { openSupabaseOAuthPopup } = await import('@/lib/supabaseConnect');
        const result = await openSupabaseOAuthPopup();
        if (!result.opened) {
          throw new Error(
            result.error || 'Could not start Supabase authorization.',
          );
        }
        return;
      }

      setView('developer');
      setConnectingId(null);
    } catch (error) {
      setConnectingId(null);
      toast.error(
        error instanceof Error
          ? error.message
          : `Could not connect ${plugin.name}`,
      );
    }
  }

  function handleConnect(plugin: MarketplacePlugin) {
    setSelectedPlugin(null);

    if (plugin.source === 'credential') {
      setView('custom');
      return;
    }

    if (plugin.source === 'native') {
      void connectNative(plugin);
      return;
    }

    void connectComposio(plugin);
  }

  const searchActive = query.trim().length > 0;
  const noSearchResults =
    searchActive &&
    !semanticLoading &&
    searchResults.length === 0;

  return (
    <div className="space-y-8">
      <header className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-[28px]">
              Plugins
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              Connect the tools Xroga can securely work with. Search by app or describe what you&apos;d like Xroga to do.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setView('custom')}
            className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3.5 py-2 text-sm font-semibold text-[var(--text-primary)] shadow-subtle hover:border-[var(--border-strong)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add plugin
          </button>
        </div>

        <div className="relative">
          <label htmlFor="xroga-plugin-search" className="sr-only">
            Search Plugins
          </label>
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <input
            id="xroga-plugin-search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleCount(INITIAL_VISIBLE);
              if (view !== 'discover') setView('discover');
            }}
            placeholder="Search plugins or describe what you want Xroga to do…"
            className="w-full rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] py-3.5 pl-11 pr-12 text-sm text-[var(--text-primary)] shadow-subtle outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:shadow-[var(--focus-ring)]"
          />
          {semanticLoading ? (
            <Loader2
              className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--text-muted)]"
              aria-label="Searching Plugins"
            />
          ) : query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-token-sm p-2 text-[var(--text-muted)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              aria-label="Clear Plugin search"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <nav
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
          aria-label="Plugin sections"
        >
          {VIEWS.map((item) => {
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'min-h-10 shrink-0 rounded-token-sm px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                  active
                    ? 'bg-[var(--surface-inset)] text-[var(--text-primary)] shadow-subtle'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]',
                )}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-start gap-2 rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-3.5 py-3">
          <ShieldCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]"
            aria-hidden="true"
          />
          <p className="text-xs leading-5 text-[var(--text-secondary)]">
            Xroga only takes actions you authorize. Sensitive actions may require confirmation.
          </p>
        </div>
      </header>

      {view === 'discover' ? (
        <div className="space-y-8">
          {semanticError && searchActive ? (
            <div
              role="status"
              className="flex items-start gap-2 rounded-token-md border border-amber-500/25 bg-amber-500/5 px-3.5 py-3 text-sm text-[var(--text-secondary)]"
            >
              <CircleAlert
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
                aria-hidden="true"
              />
              <div>
                <p className="font-semibold text-[var(--text-primary)]">
                  Live capability search is temporarily unavailable.
                </p>
                <p className="mt-0.5 text-xs leading-5">
                  Local Plugin search still works. {semanticError}
                </p>
              </div>
            </div>
          ) : null}

          {searchActive ? (
            <section>
              <SectionHeading
                title="Search results"
                meta={`${searchResults.length} ${searchResults.length === 1 ? 'Plugin' : 'Plugins'}`}
              />

              {noSearchResults ? (
                <MarketplaceEmpty
                  title={`No Plugin found for “${query.trim()}”`}
                  description="Try another search, or share the Plugin you need with the Xroga community."
                  action={
                    <Link
                      href="/community"
                      className="inline-flex items-center gap-1.5 rounded-token-sm border border-[var(--border-subtle)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                    >
                      Request a Plugin
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  }
                />
              ) : (
                <PluginGrid
                  plugins={visiblePlugins}
                  connectingId={connectingId}
                  checkingNative={checkingNative}
                  onConnect={handleConnect}
                  onPreview={setSelectedPlugin}
                />
              )}
            </section>
          ) : (
            <>
              <section>
                <SectionHeading
                  title="Connected"
                  meta={
                    connectedPlugins.length
                      ? `${connectedPlugins.length} connected`
                      : undefined
                  }
                />

                {connectedPlugins.length ? (
                  <PluginGrid
                    plugins={connectedPlugins.slice(0, 6)}
                    connectingId={connectingId}
                    checkingNative={checkingNative}
                    onConnect={handleConnect}
                    onPreview={setSelectedPlugin}
                  />
                ) : checkingNative ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {[0, 1, 2].map((item) => (
                      <div
                        key={item}
                        className="h-[142px] animate-pulse rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]"
                      />
                    ))}
                  </div>
                ) : (
                  <MarketplaceEmpty
                    title="No Plugins connected yet"
                    description="Connect the tools you use so Xroga can work with them when you ask."
                  />
                )}
              </section>

              <section>
                <SectionHeading title="Popular" />
                <PluginGrid
                  plugins={popularPlugins}
                  connectingId={connectingId}
                  checkingNative={checkingNative}
                  onConnect={handleConnect}
                  onPreview={setSelectedPlugin}
                />
              </section>
            </>
          )}

          <section>
            <SectionHeading title="Categories" />
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {(['All', ...PLUGIN_CATEGORIES] as const).map((item) => {
                const active = category === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setCategory(item);
                      setVisibleCount(INITIAL_VISIBLE);
                    }}
                    aria-pressed={active}
                    className={cn(
                      'min-h-9 shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                      active
                        ? 'border-[var(--accent)]/35 bg-[var(--accent)]/10 text-[var(--text-primary)]'
                        : 'border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </section>

          {!searchActive ? (
            <section>
              <SectionHeading
                title="All Plugins"
                meta={`${allDiscoverPlugins.length} available`}
              />
              <PluginGrid
                plugins={visiblePlugins}
                connectingId={connectingId}
                checkingNative={checkingNative}
                onConnect={handleConnect}
                onPreview={setSelectedPlugin}
              />
            </section>
          ) : null}

          {(query.trim() ? searchResults : allDiscoverPlugins).length >
          visibleCount ? (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() =>
                  setVisibleCount((current) => current + INITIAL_VISIBLE)
                }
                className="rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                Show more
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {view === 'connected' ? (
        <section>
          <SectionHeading
            title="Connected Plugins"
            meta={`${connectedPlugins.length} connected`}
          />
          {connectedPlugins.length ? (
            <PluginGrid
              plugins={connectedPlugins}
              connectingId={connectingId}
              checkingNative={checkingNative}
              onConnect={handleConnect}
              onPreview={setSelectedPlugin}
            />
          ) : (
            <MarketplaceEmpty
              title="No Plugins connected yet"
              description="Browse Discover and connect the apps and services you use."
              action={
                <button
                  type="button"
                  onClick={() => setView('discover')}
                  className="inline-flex items-center gap-1.5 rounded-token-sm border border-[var(--border-subtle)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                >
                  Browse Plugins
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              }
            />
          )}
        </section>
      ) : null}

      {view === 'developer' ? (
        <div className="space-y-5">
          <div>
            <SectionHeading title="Developer Plugins" />
            <p className="-mt-1 text-sm leading-6 text-[var(--text-secondary)]">
              Code, deployment, backend, and observability services used by Xroga projects.
            </p>
          </div>

          <PluginGrid
            plugins={developerPlugins}
            connectingId={connectingId}
            checkingNative={checkingNative}
            onConnect={handleConnect}
            onPreview={setSelectedPlugin}
          />

          <div className="flex flex-col gap-3 rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Ready to ship a project?
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                Publishing stays separate from Plugins so deployment setup only appears when you need it.
              </p>
            </div>

            <Link
              href="/dashboard/publish"
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-token-sm border border-[var(--border-subtle)] px-3.5 py-2 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              Open Publish
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      ) : null}

      {view === 'custom' ? (
        <div className="space-y-6">
          <div>
            <SectionHeading title="Custom Plugins" />
            <p className="-mt-1 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              Configure service credentials, API keys, and webhooks that Xroga can use for your projects.
            </p>
          </div>

          <ConnectedServicesSection />
          <CustomCredentialsSection />
        </div>
      ) : null}

      {selectedPlugin ? (
        <PluginPreview
          plugin={selectedPlugin}
          connecting={connectingId === selectedPlugin.id}
          onClose={() => setSelectedPlugin(null)}
          onConnect={handleConnect}
        />
      ) : null}

      <footer className="border-t border-[var(--border-subtle)] pt-5 text-xs leading-5 text-[var(--text-muted)]">
        Plugin availability can depend on provider configuration and your account permissions. Xroga keeps unrelated Plugins usable when one provider is unavailable.
      </footer>
    </div>
  );
}
