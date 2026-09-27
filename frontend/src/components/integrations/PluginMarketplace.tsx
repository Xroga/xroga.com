'use client';

import Link from 'next/link';
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Check,
  ChevronRight,
  ExternalLink,
  KeyRound,
  Loader2,
  Search,
  Server,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { ConnectedServicesSection } from '@/components/integrations/ConnectedServicesSection';
import { CustomCredentialsSection } from '@/components/integrations/CustomCredentialsSection';
import { IntegrationLogo } from '@/components/integrations/IntegrationLogo';
import { api } from '@/lib/api';
import {
  CATEGORY_ORDER,
  PLUGIN_DEFINITIONS,
  POPULAR_HYDRATION_QUERY,
  canonicalPluginId,
  displayToolkitName,
  genericPluginDefinition,
  inferCategory,
  type ConnectionState,
  type NativePluginId,
  type PluginView,
  type RuntimePlugin,
} from '@/lib/pluginCatalog';
import {
  clearOAuthResult,
  subscribeOAuthResults,
} from '@/lib/oauthPopupResult';
import {
  xrogaConnect,
  type XrogaConnectToolkit,
  type XrogaConnectTool,
} from '@/lib/xrogaConnect';

type NativeSnapshot = {
  state: ConnectionState;
  accountLabel?: string;
  statusMessage?: string;
};

type ConnectedFilter = 'all' | 'apps' | 'developer' | 'attention';

function viewFrom(value: string | null): PluginView {
  if (value === 'connected' || value === 'developer' || value === 'custom') return value;
  return 'discover';
}

function PluginMark({ plugin }: { plugin: RuntimePlugin }) {
  const [failed, setFailed] = useState(false);

  if (plugin.logo && !failed) {
    return (
      <img
        src={plugin.logo}
        alt=""
        loading="lazy"
        className="h-10 w-10 shrink-0 rounded-xl border border-[var(--border-subtle)] bg-white object-contain p-1.5"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-inset)]">
      <IntegrationLogo
        id={plugin.id}
        name={plugin.name}
        size={22}
        className="max-h-6 max-w-6"
      />
    </span>
  );
}

function PluginCard({
  plugin,
  connecting,
  onConnect,
}: {
  plugin: RuntimePlugin;
  connecting: boolean;
  onConnect: (plugin: RuntimePlugin) => void;
}) {
  const checking = plugin.connectionState === 'checking';
  const needsAttention =
    plugin.connectionState === 'needs_attention' || plugin.connectionState === 'error';

  return (
    <article className="group flex min-h-[156px] flex-col rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-subtle motion-reduce:transform-none">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/dashboard/integrations/${encodeURIComponent(plugin.id)}`}
          className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          aria-label={`View ${plugin.name} Plugin details`}
        >
          <PluginMark plugin={plugin} />
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-[var(--text-primary)]">
              {plugin.name}
            </h3>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{plugin.category}</p>
          </div>
        </Link>

        {plugin.connected || plugin.noAuth ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)]">
            <Check className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
            {plugin.noAuth ? 'Ready' : 'Connected'}
          </span>
        ) : needsAttention ? (
          <Link
            href={`/dashboard/integrations/${encodeURIComponent(plugin.id)}`}
            className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-2.5 text-[11px] font-semibold text-[var(--text-primary)]"
          >
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
            Review
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => onConnect(plugin)}
            disabled={connecting || checking}
            aria-label={`Connect ${plugin.name}`}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-token-sm border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--accent)]/60 hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {connecting || checking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {checking ? 'Checking' : connecting ? 'Connecting' : 'Connect'}
          </button>
        )}
      </div>

      <Link
        href={`/dashboard/integrations/${encodeURIComponent(plugin.id)}`}
        className="mt-3 line-clamp-2 rounded-md text-sm leading-5 text-[var(--text-secondary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        {plugin.description}
      </Link>

      <div className="mt-auto flex items-end justify-between gap-2 pt-3">
        <div className="min-w-0">
          {plugin.accountLabel ? (
            <p className="truncate text-[11px] font-medium text-[var(--text-primary)]">
              {plugin.accountLabel}
            </p>
          ) : null}
          <p className="text-[11px] text-[var(--text-muted)]">
            {plugin.capabilityCount
              ? `${plugin.capabilityCount} ${plugin.capabilityCount === 1 ? 'capability' : 'capabilities'}`
              : plugin.source === 'native'
                ? 'Xroga native'
                : plugin.noAuth
                  ? 'No authorization required'
                  : 'Xroga Connect'}
          </p>
        </div>

        <Link
          href={`/dashboard/integrations/${encodeURIComponent(plugin.id)}`}
          className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:underline"
        >
          {plugin.connected ? 'Manage' : 'View details'}
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

function PluginGrid({
  plugins,
  connectingId,
  onConnect,
}: {
  plugins: RuntimePlugin[];
  connectingId: string | null;
  onConnect: (plugin: RuntimePlugin) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {plugins.map((plugin) => (
        <PluginCard
          key={plugin.id}
          plugin={plugin}
          connecting={connectingId === plugin.id}
          onConnect={onConnect}
        />
      ))}
    </div>
  );
}

export function PluginMarketplace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [view, setViewState] = useState<PluginView>(() => viewFrom(searchParams.get('view')));
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const deferredQuery = useDeferredValue(query.trim());
  const [category, setCategory] = useState('All');
  const [visibleCount, setVisibleCount] = useState(12);
  const [nativeState, setNativeState] = useState<Record<NativePluginId, NativeSnapshot>>({
    github: { state: 'checking' },
    vercel: { state: 'checking' },
    supabase: { state: 'checking' },
  });
  const [composioConfigured, setComposioConfigured] = useState<boolean | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [toolkitMap, setToolkitMap] = useState<Record<string, XrogaConnectToolkit>>({});
  const [toolCountByToolkit, setToolCountByToolkit] = useState<Record<string, number>>({});
  const [semanticToolkits, setSemanticToolkits] = useState<XrogaConnectToolkit[]>([]);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticError, setSemanticError] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectedOverrides, setConnectedOverrides] = useState<Record<string, boolean>>({});
  const [connectedQuery, setConnectedQuery] = useState('');
  const [connectedFilter, setConnectedFilter] = useState<ConnectedFilter>('all');
  const requestSeq = useRef(0);

  function setView(next: PluginView) {
    setViewState(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'discover') params.delete('view');
    else params.set('view', next);
    const suffix = params.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
  }

  function openCustom() {
    setView('custom');
    window.setTimeout(() => {
      document.getElementById('custom-plugin-options')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 0);
  }

  const refreshNativeStatus = () => {
    setNativeState((current) => ({
      github: current.github.state === 'connected' ? current.github : { state: 'checking' },
      vercel: current.vercel.state === 'connected' ? current.vercel : { state: 'checking' },
      supabase: current.supabase.state === 'connected' ? current.supabase : { state: 'checking' },
    }));

    void Promise.allSettled([
      api.github.status(),
      api.vercel.status(),
      api.supabase.status(),
    ]).then((results) => {
      const github =
        results[0].status === 'fulfilled'
          ? {
              state: results[0].value.connected ? ('connected' as const) : ('disconnected' as const),
              accountLabel:
                results[0].value.connected && results[0].value.username
                  ? `@${results[0].value.username}`
                  : undefined,
            }
          : { state: 'error' as const, statusMessage: 'GitHub status unavailable' };

      const vercel =
        results[1].status === 'fulfilled'
          ? {
              state: results[1].value.connected
                ? results[1].value.tokenValid === false
                  ? ('needs_attention' as const)
                  : ('connected' as const)
                : ('disconnected' as const),
              accountLabel: results[1].value.username || undefined,
              statusMessage: results[1].value.warning || results[1].value.error,
            }
          : { state: 'error' as const, statusMessage: 'Vercel status unavailable' };

      const supabase =
        results[2].status === 'fulfilled'
          ? {
              state: results[2].value.connected ? ('connected' as const) : ('disconnected' as const),
              statusMessage: results[2].value.message,
            }
          : { state: 'error' as const, statusMessage: 'Supabase status unavailable' };

      setNativeState({ github, vercel, supabase });
    });
  };

  function absorbSearchResult(
    toolkits: XrogaConnectToolkit[],
    tools: XrogaConnectTool[],
  ) {
    setToolkitMap((current) => {
      const next = { ...current };

      for (const item of toolkits) {
        const id = canonicalPluginId(`${item.name ?? ''} ${item.toolkit}`);
        next[id] = item;
      }

      return next;
    });

    setToolCountByToolkit((current) => {
      const next = { ...current };
      const counts: Record<string, number> = {};

      for (const tool of tools) {
        counts[tool.toolkit] = (counts[tool.toolkit] ?? 0) + 1;
      }

      for (const [toolkit, count] of Object.entries(counts)) {
        next[toolkit] = count;
      }

      return next;
    });

    const connected: Record<string, boolean> = {};
    for (const item of toolkits) {
      if (item.connected || item.noAuth) {
        connected[canonicalPluginId(`${item.name ?? ''} ${item.toolkit}`)] = true;
      }
    }

    if (Object.keys(connected).length) {
      setConnectedOverrides((current) => ({ ...current, ...connected }));
    }
  }

  useEffect(() => {
    refreshNativeStatus();

    let active = true;

    void xrogaConnect
      .status()
      .then(async (status) => {
        if (!active) return;
        setComposioConfigured(status.configured);
        if (!status.configured) return;

        try {
          const result = await xrogaConnect.search(POPULAR_HYDRATION_QUERY);
          if (!active) return;
          setSessionId(result.sessionId);
          absorbSearchResult(result.toolkits ?? [], result.tools ?? []);

          try {
            const connected = await xrogaConnect.toolkits(result.sessionId, {
              connectedOnly: true,
            });
            if (!active) return;
            absorbSearchResult(connected.toolkits ?? [], []);
          } catch {
            // Search-derived connection state remains available if toolkit listing fails.
          }
        } catch {
          // Curated local metadata remains usable when live discovery is unavailable.
        }
      })
      .catch(() => {
        if (active) setComposioConfigured(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const github = params.get('github');
    const vercel = params.get('vercel');
    const supabase = params.get('supabase');
    const composio = params.get('composio');
    const message = params.get('message');

    if (github === 'connected') toast.success('GitHub connected');
    else if (github === 'error' || github === 'missing_code') {
      toast.error(message || 'GitHub authorization failed');
    }

    if (vercel === 'connected') toast.success('Vercel connected');
    else if (vercel === 'error' || vercel === 'missing_code') {
      toast.error(message || 'Vercel authorization failed');
    }

    if (supabase === 'connected') toast.success('Supabase authorized');
    else if (supabase === 'error' || supabase === 'missing_code') {
      toast.error(message || 'Supabase authorization failed');
    }

    if (composio === 'connected') toast.success('Plugin connected to Xroga');
    else if (composio === 'error') toast.error(message || 'Plugin connection failed');

    if (github || vercel || supabase || composio) {
      refreshNativeStatus();

      const returnPath = sessionStorage.getItem('xroga-plugin-return');
      if (returnPath) {
        sessionStorage.removeItem('xroga-plugin-return');
        router.replace(returnPath);
        return;
      }

      const url = new URL(window.location.href);
      ['github', 'vercel', 'supabase', 'composio', 'message', 'username', 'pick'].forEach((key) =>
        url.searchParams.delete(key),
      );
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, [router]);

  useEffect(
    () =>
      subscribeOAuthResults((payload) => {
        if (payload.type === 'xroga-composio-connected') {
          if (connectingId) {
            setConnectedOverrides((current) => ({ ...current, [connectingId]: true }));
          }
          setConnectingId(null);
          toast.success('Plugin connected to Xroga');
        }

        if (payload.type === 'xroga-composio-error') {
          setConnectingId(null);
          toast.error(payload.message || 'Plugin connection failed');
        }
      }),
    [connectingId],
  );

  useEffect(() => {
    const clean = deferredQuery;

    if (!composioConfigured || clean.length < 2) {
      setSemanticToolkits([]);
      setSemanticError(false);
      return;
    }

    const seq = ++requestSeq.current;
    const timer = window.setTimeout(() => {
      setSemanticLoading(true);
      setSemanticError(false);

      void xrogaConnect
        .search(clean, sessionId ?? undefined)
        .then((result) => {
          if (requestSeq.current !== seq) return;
          setSessionId(result.sessionId);
          setSemanticToolkits(result.toolkits ?? []);
          absorbSearchResult(result.toolkits ?? [], result.tools ?? []);
        })
        .catch(() => {
          if (requestSeq.current !== seq) return;
          setSemanticError(true);
        })
        .finally(() => {
          if (requestSeq.current === seq) setSemanticLoading(false);
        });
    }, 450);

    return () => window.clearTimeout(timer);
  // sessionId is continuity state returned by search, not a reason to re-run the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredQuery, composioConfigured]);

  const basePlugins = useMemo<RuntimePlugin[]>(
    () =>
      PLUGIN_DEFINITIONS.map((plugin) => {
        const toolkit = toolkitMap[plugin.id];
        const native = plugin.source === 'native'
          ? nativeState[plugin.id as NativePluginId]
          : undefined;

        return {
          ...plugin,
          toolkit: toolkit?.toolkit,
          logo: toolkit?.logo,
          noAuth: toolkit?.noAuth,
          connected:
            plugin.source === 'native'
              ? native?.state === 'connected'
              : Boolean(connectedOverrides[plugin.id] || toolkit?.connected || toolkit?.noAuth),
          connectionState: native?.state,
          accountLabel:
            plugin.source === 'native'
              ? native?.accountLabel
              : toolkit?.connected
                ? toolkit.statusMessage
                : undefined,
          statusMessage: native?.statusMessage || toolkit?.statusMessage,
          capabilityCount: toolkit?.toolkit ? toolCountByToolkit[toolkit.toolkit] : undefined,
        };
      }),
    [toolkitMap, nativeState, connectedOverrides, toolCountByToolkit],
  );

  const semanticPlugins = useMemo<RuntimePlugin[]>(() => {
    const baseIds = new Set(basePlugins.map((plugin) => plugin.id));

    // toolkitMap contains both search discoveries and the server's real
    // connected-toolkit listing. Building dynamic cards from it ensures a
    // long-tail connected Plugin remains visible even when it is not curated.
    return Object.values(toolkitMap)
      .map((item) => {
        const name = item.name || displayToolkitName(item.toolkit);
        const id = canonicalPluginId(`${name} ${item.toolkit}`);
        const generic = genericPluginDefinition(item.toolkit);

        return {
          ...generic,
          id,
          name,
          description:
            item.description ||
            item.statusMessage ||
            'Connect this app so Xroga can use its available capabilities.',
          category: inferCategory(name, item.description),
          source: 'composio' as const,
          toolkit: item.toolkit,
          logo: item.logo,
          noAuth: item.noAuth,
          connected: Boolean(item.connected || item.noAuth || connectedOverrides[id]),
          accountLabel: item.connected ? item.statusMessage : undefined,
          statusMessage: item.statusMessage,
          capabilityCount: toolCountByToolkit[item.toolkit],
        };
      })
      .filter((plugin) => !baseIds.has(plugin.id));
  }, [toolkitMap, basePlugins, connectedOverrides, toolCountByToolkit]);

  const allPlugins = useMemo(
    () => [...basePlugins, ...semanticPlugins],
    [basePlugins, semanticPlugins],
  );

  const searchedPlugins = useMemo(() => {
    const clean = deferredQuery.toLowerCase();

    return allPlugins.filter((plugin) => {
      if (category !== 'All' && plugin.category !== category) return false;
      if (!clean) return true;

      const searchText = [
        plugin.name,
        plugin.description,
        plugin.category,
        ...(plugin.keywords ?? []),
        ...(plugin.examples ?? []),
        plugin.accountLabel,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchText.includes(clean) || semanticPlugins.some((semantic) => semantic.id === plugin.id);
    });
  }, [allPlugins, category, deferredQuery, semanticPlugins]);

  const connectedPlugins = useMemo(
    () =>
      allPlugins.filter(
        (plugin) =>
          plugin.connected ||
          plugin.noAuth ||
          plugin.connectionState === 'needs_attention',
      ),
    [allPlugins],
  );

  const filteredConnected = useMemo(() => {
    const clean = connectedQuery.trim().toLowerCase();

    return connectedPlugins.filter((plugin) => {
      if (connectedFilter === 'apps' && plugin.developer) return false;
      if (connectedFilter === 'developer' && !plugin.developer) return false;
      if (
        connectedFilter === 'attention' &&
        plugin.connectionState !== 'needs_attention' &&
        plugin.connectionState !== 'error'
      ) {
        return false;
      }

      if (!clean) return true;

      return [
        plugin.name,
        plugin.category,
        plugin.accountLabel,
        plugin.statusMessage,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(clean);
    });
  }, [connectedPlugins, connectedFilter, connectedQuery]);

  const popularPlugins = useMemo(
    () => basePlugins.filter((plugin) => plugin.popular).slice(0, 9),
    [basePlugins],
  );

  const developerPlugins = useMemo(
    () => basePlugins.filter((plugin) => plugin.developer),
    [basePlugins],
  );

  const developerConnected = useMemo(
    () =>
      developerPlugins.filter(
        (plugin) => plugin.connected || plugin.connectionState === 'needs_attention',
      ),
    [developerPlugins],
  );

  const developerAvailable = useMemo(
    () =>
      developerPlugins.filter(
        (plugin) => !plugin.connected && plugin.connectionState !== 'needs_attention',
      ),
    [developerPlugins],
  );

  async function connectNative(plugin: RuntimePlugin) {
    const id = plugin.id as NativePluginId;

    if (id === 'github') {
      const { url } = await api.github.oauthUrl();
      if (!url) throw new Error('GitHub authorization is not available.');
      window.location.href = url;
      return;
    }

    if (id === 'vercel') {
      const result = await api.vercel.oauthUrl();
      if (!result.oauthConfigured || !result.url) {
        throw new Error('Vercel authorization is not configured.');
      }
      window.location.href = result.url;
      return;
    }

    const result = await api.supabase.oauthUrl();
    if (!result.oauthConfigured || !result.url) {
      throw new Error(result.message || 'Supabase authorization is not configured.');
    }
    window.location.href = result.url;
  }

  async function connectComposio(plugin: RuntimePlugin) {
    if (!composioConfigured) {
      throw new Error('Connected business apps are temporarily unavailable.');
    }

    let activeSession = sessionId;
    let toolkit = plugin.toolkit || toolkitMap[plugin.id]?.toolkit;

    if (!activeSession || !toolkit) {
      const result = await xrogaConnect.search(
        plugin.query || `find ${plugin.name} capabilities`,
        activeSession ?? undefined,
      );

      activeSession = result.sessionId;
      setSessionId(result.sessionId);
      absorbSearchResult(result.toolkits ?? [], result.tools ?? []);

      const exact =
        result.toolkits?.find(
          (item) =>
            canonicalPluginId(`${item.name ?? ''} ${item.toolkit}`) === plugin.id,
        ) ?? result.toolkits?.[0];

      if (exact?.connected || exact?.noAuth) {
        setConnectedOverrides((current) => ({ ...current, [plugin.id]: true }));
        toast.success(
          exact.noAuth
            ? `${plugin.name} is ready to use`
            : `${plugin.name} is already connected`,
        );
        return;
      }

      toolkit = exact?.toolkit;
    }

    if (!activeSession || !toolkit) {
      throw new Error(`${plugin.name} is not currently available to connect.`);
    }

    clearOAuthResult();

    const popup = window.open(
      '',
      'xroga-connect-oauth',
      'width=600,height=760,resizable=yes,scrollbars=yes',
    );

    try {
      const result = await xrogaConnect.link(activeSession, toolkit);
      if (!result.redirectUrl) throw new Error('Authorization link was not returned.');

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
        // Ignore popup close failures.
      }
      throw error;
    }
  }

  async function handleConnect(plugin: RuntimePlugin) {
    if (connectingId || plugin.noAuth) return;
    setConnectingId(plugin.id);

    try {
      if (plugin.source === 'native') await connectNative(plugin);
      else await connectComposio(plugin);
    } catch (error) {
      setConnectingId(null);
      toast.error(error instanceof Error ? error.message : `Could not connect ${plugin.name}`);
    }
  }

  const noResults = searchedPlugins.length === 0 && deferredQuery.length > 0;

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-[28px]">
            Plugins
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
            Connect and manage the tools Xroga can securely work with. Search by app or describe what you want Xroga to do.
          </p>
        </div>

        <button
          type="button"
          onClick={openCustom}
          className="inline-flex min-h-10 items-center justify-center rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          + Add Plugin
        </button>
      </header>

      <div className="relative">
        <label htmlFor="plugin-marketplace-search" className="sr-only">
          Search Plugins
        </label>
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
          aria-hidden="true"
        />
        <input
          id="plugin-marketplace-search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setVisibleCount(12);
          }}
          placeholder="Search Plugins or describe what you want Xroga to do…"
          className="w-full rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] py-3.5 pl-11 pr-12 text-sm text-[var(--text-primary)] shadow-subtle outline-none transition focus:border-[var(--accent)] focus-visible:shadow-[var(--focus-ring)]"
        />
        {semanticLoading ? (
          <Loader2
            className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--text-muted)]"
            aria-label="Searching Plugins"
          />
        ) : null}
      </div>

      <nav
        className="flex gap-1 overflow-x-auto border-b border-[var(--border-subtle)] pb-px scrollbar-hide"
        aria-label="Plugin views"
      >
        {(['discover', 'connected', 'developer', 'custom'] as PluginView[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setView(item)}
            aria-current={view === item ? 'page' : undefined}
            className={
              view === item
                ? 'shrink-0 border-b-2 border-[var(--accent)] px-3 py-2.5 text-sm font-semibold text-[var(--text-primary)]'
                : 'shrink-0 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }
          >
            {item.charAt(0).toUpperCase() + item.slice(1)}
          </button>
        ))}
      </nav>

      {view === 'discover' ? (
        <div className="space-y-8">
          <section>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Connected</h2>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  Plugins ready for Xroga to use.
                </p>
              </div>
              {connectedPlugins.length ? (
                <button
                  type="button"
                  onClick={() => setView('connected')}
                  className="text-xs font-semibold text-[var(--accent)] hover:underline"
                >
                  View all
                </button>
              ) : null}
            </div>

            {connectedPlugins.length ? (
              <PluginGrid
                plugins={connectedPlugins.slice(0, 3)}
                connectingId={connectingId}
                onConnect={handleConnect}
              />
            ) : (
              <div className="rounded-token-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-inset)]/45 px-4 py-5">
                <p className="text-sm font-medium text-[var(--text-primary)]">No Plugins connected yet.</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                  Browse below and connect the tools you use. GitHub is not required before other Plugins.
                </p>
              </div>
            )}
          </section>

          <section>
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Popular</h2>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                Useful Plugins for common Xroga workflows.
              </p>
            </div>
            <PluginGrid
              plugins={popularPlugins}
              connectingId={connectingId}
              onConnect={handleConnect}
            />
          </section>

          <section>
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Categories</h2>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" role="group" aria-label="Plugin categories">
              {CATEGORY_ORDER.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setCategory(item);
                    setVisibleCount(12);
                  }}
                  aria-pressed={category === item}
                  className={
                    category === item
                      ? 'shrink-0 rounded-full border border-[var(--accent)] bg-[var(--accent-dim)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)]'
                      : 'shrink-0 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
                  }
                >
                  {item}
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                  {deferredQuery ? 'Search results' : 'All Plugins'}
                </h2>
                {deferredQuery ? (
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    {searchedPlugins.length} {searchedPlugins.length === 1 ? 'Plugin' : 'Plugins'} matching “{deferredQuery}”
                  </p>
                ) : null}
              </div>
            </div>

            {semanticError ? (
              <div className="mb-3 flex items-start gap-2 rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3" role="status">
                <Search className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
                <p className="text-xs leading-5 text-[var(--text-secondary)]">
                  Live capability search is temporarily unavailable. Local Plugin search is still working.
                </p>
              </div>
            ) : null}

            {noResults ? (
              <div className="rounded-token-lg border border-dashed border-[var(--border-subtle)] px-5 py-8 text-center">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  No Plugin found for “{deferredQuery}”
                </h3>
                <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[var(--text-secondary)]">
                  Try another search, or request the Plugin through Xroga Community.
                </p>
                <Link
                  href="/community"
                  className="mt-4 inline-flex min-h-9 items-center rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent)]/60"
                >
                  Request Plugin
                </Link>
              </div>
            ) : (
              <>
                <PluginGrid
                  plugins={searchedPlugins.slice(0, visibleCount)}
                  connectingId={connectingId}
                  onConnect={handleConnect}
                />
                {searchedPlugins.length > visibleCount ? (
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setVisibleCount((current) => current + 12)}
                      className="min-h-10 rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                    >
                      Show more
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>
      ) : null}

      {view === 'connected' ? (
        <section className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Connected Plugins</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Manage the accounts and services currently available to Xroga.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative">
              <label htmlFor="connected-plugin-search" className="sr-only">
                Search connected Plugins
              </label>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                aria-hidden="true"
              />
              <input
                id="connected-plugin-search"
                value={connectedQuery}
                onChange={(event) => setConnectedQuery(event.target.value)}
                placeholder="Search connected Plugins…"
                className="w-full rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-raised)] py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Connected Plugin filters">
              {([
                ['all', 'All'],
                ['apps', 'Apps'],
                ['developer', 'Developer'],
                ['attention', 'Needs attention'],
              ] as Array<[ConnectedFilter, string]>).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setConnectedFilter(id)}
                  aria-pressed={connectedFilter === id}
                  className={
                    connectedFilter === id
                      ? 'shrink-0 rounded-full border border-[var(--accent)] bg-[var(--accent-dim)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)]'
                      : 'shrink-0 rounded-full border border-[var(--border-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)]'
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filteredConnected.length ? (
            <PluginGrid
              plugins={filteredConnected}
              connectingId={connectingId}
              onConnect={handleConnect}
            />
          ) : (
            <div className="rounded-token-lg border border-dashed border-[var(--border-subtle)] px-5 py-8">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {connectedPlugins.length ? 'No connected Plugins match this view.' : 'No Plugins connected yet.'}
              </p>
              <button
                type="button"
                onClick={() => setView('discover')}
                className="mt-3 text-xs font-semibold text-[var(--accent)] hover:underline"
              >
                Browse Plugins
              </button>
            </div>
          )}
        </section>
      ) : null}

      {view === 'developer' ? (
        <section className="space-y-7">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Developer Plugins</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              Infrastructure Xroga uses for code, hosting, backend services and monitoring. Publishing remains a separate workflow.
            </p>
          </div>

          {developerConnected.length ? (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Connected</h3>
              <PluginGrid
                plugins={developerConnected}
                connectingId={connectingId}
                onConnect={handleConnect}
              />
            </div>
          ) : null}

          <div>
            <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Available</h3>
            {developerAvailable.length ? (
              <PluginGrid
                plugins={developerAvailable}
                connectingId={connectingId}
                onConnect={handleConnect}
              />
            ) : (
              <p className="rounded-token-lg border border-dashed border-[var(--border-subtle)] p-4 text-sm text-[var(--text-secondary)]">
                All currently supported Developer Plugins are connected.
              </p>
            )}
          </div>

          <div className="rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3 text-xs leading-5 text-[var(--text-secondary)]">
            Configure production targets, builds and shipping from{' '}
            <Link href="/dashboard/publish" className="font-semibold text-[var(--accent)] hover:underline">
              Publish
            </Link>
            . Plugins only manages the provider connection and capabilities.
          </div>
        </section>
      ) : null}

      {view === 'custom' ? (
        <section id="custom-plugin-options" className="space-y-6 scroll-mt-8">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Custom Plugins</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              Use Xroga’s real credential and webhook support for services outside the built-in catalogue.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <button
              type="button"
              onClick={() => setView('discover')}
              className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 text-left hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              <Search className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">Search marketplace</p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                Find a built-in or Xroga Connect Plugin first.
              </p>
            </button>

            <div className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
              <Server className="h-5 w-5 text-[var(--text-muted)]" aria-hidden="true" />
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Custom MCP server</p>
                <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
                  Unavailable
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                Xroga’s current backend does not expose persistent custom MCP create/update/delete APIs, so this UI does not fake a saved MCP Plugin.
              </p>
            </div>

            <div className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
              <KeyRound className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">API credentials & webhooks</p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                Fully available through Xroga’s existing encrypted credential vault below.
              </p>
            </div>
          </div>

          <ConnectedServicesSection />
          <CustomCredentialsSection />
        </section>
      ) : null}

      <div className="flex items-start gap-2 rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
        <p className="text-xs leading-5 text-[var(--text-secondary)]">
          Xroga only takes actions you authorize. Sensitive, destructive, financial, or permission-changing actions may require confirmation.
        </p>
      </div>
    </div>
  );
}