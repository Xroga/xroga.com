'use client';

import Link from 'next/link';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Loader2,
  Plug,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  xrogaConnect,
  type XrogaConnectSearchResult,
} from '@/lib/xrogaConnect';
import {
  clearOAuthResult,
  subscribeOAuthResults,
} from '@/lib/oauthPopupResult';
import { openGitHubOAuthPopup } from '@/lib/githubConnect';
import {
  COMPOSIO_PLUGIN_SEEDS,
  CREDENTIAL_PLUGIN_SEEDS,
  NATIVE_PLUGIN_SEEDS,
  PLUGIN_CATEGORIES,
  PLUGIN_VIEWS,
  canonicalPluginId,
  mergePluginRecords,
  pluginFromSeed,
  pluginFromToolkit,
  rankPlugins,
  seedForPlugin,
  type PluginCategory,
  type PluginRecord,
  type PluginView,
} from '@/lib/pluginMarketplace';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PluginLogo } from '@/components/integrations/PluginLogo';
import { ConnectedServicesSection } from '@/components/integrations/ConnectedServicesSection';
import { CustomCredentialsSection } from '@/components/integrations/CustomCredentialsSection';

const POPULAR_DISCOVERY_QUERY =
  'Gmail Google Calendar Google Drive Slack Stripe Shopify HubSpot Notion Airtable QuickBooks Linear Sentry';

type NativeConnectionState = {
  connected: boolean | null;
  statusMessage?: string;
};

type NativeStateMap = Record<'github' | 'vercel' | 'supabase', NativeConnectionState>;

const INITIAL_NATIVE_STATE: NativeStateMap = {
  github: { connected: null },
  vercel: { connected: null },
  supabase: { connected: null },
};

const VIEW_LABELS: Record<PluginView, string> = {
  discover: 'Discover',
  connected: 'Connected',
  developer: 'Developer',
  custom: 'Custom',
};

function capabilityCounts(result: XrogaConnectSearchResult): Map<string, number> {
  const counts = new Map<string, number>();

  for (const tool of result.tools ?? []) {
    counts.set(tool.toolkit, (counts.get(tool.toolkit) ?? 0) + 1);
  }

  return counts;
}

function searchPlugins(result: XrogaConnectSearchResult): PluginRecord[] {
  const counts = capabilityCounts(result);

  return (result.toolkits ?? []).map((toolkit) => {
    const plugin = pluginFromToolkit(toolkit, result.tools ?? []);
    return {
      ...plugin,
      capabilityCount: counts.get(toolkit.toolkit) ?? plugin.capabilityCount,
    };
  });
}

function statusTone(plugin: PluginRecord, checking: boolean): 'neutral' | 'accent' | 'success' | 'warning' {
  if (plugin.connected) return 'success';
  if (checking) return 'neutral';
  if (!plugin.available) return 'warning';
  return 'accent';
}

function statusText(plugin: PluginRecord, checking: boolean): string {
  if (plugin.connected) return plugin.statusMessage || 'Connected';
  if (checking) return 'Checking…';
  if (!plugin.available) return 'Unavailable';
  return 'Available';
}

function PluginSkeleton() {
  return (
    <div className="min-h-[150px] animate-pulse rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-[var(--surface-inset)]" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-3.5 w-24 rounded bg-[var(--surface-inset)]" />
          <div className="h-3 w-full max-w-[220px] rounded bg-[var(--surface-inset)]" />
        </div>
      </div>
      <div className="mt-7 h-3 w-20 rounded bg-[var(--surface-inset)]" />
    </div>
  );
}

function PluginCard({
  plugin,
  checking,
  busy,
  onPreview,
  onAction,
  showPublishLink = false,
}: {
  plugin: PluginRecord;
  checking: boolean;
  busy: boolean;
  onPreview: () => void;
  onAction: () => void;
  showPublishLink?: boolean;
}) {
  const actionLabel = plugin.connected
    ? plugin.source === 'credential'
      ? 'Manage'
      : 'Connected'
    : plugin.source === 'credential'
      ? 'Set up'
      : plugin.available
        ? 'Connect'
        : 'Unavailable';

  const actionDisabled =
    busy ||
    checking ||
    (!plugin.available && plugin.source !== 'credential') ||
    (plugin.connected && plugin.source !== 'credential');

  return (
    <article className="group flex min-h-[148px] flex-col rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-subtle motion-reduce:hover:translate-y-0">
      <div className="flex items-start gap-3">
        <PluginLogo id={plugin.id} name={plugin.name} src={plugin.logo} />

        <button
          type="button"
          onClick={onPreview}
          className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          aria-label={`View ${plugin.name} Plugin`}
        >
          <span className="flex items-start justify-between gap-2">
            <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
              {plugin.name}
            </span>
            <ChevronRight
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
              aria-hidden="true"
            />
          </span>

          <span className="mt-1.5 line-clamp-2 block text-[13px] leading-5 text-[var(--text-secondary)]">
            {plugin.description}
          </span>
        </button>
      </div>

      <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-4">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-[var(--text-muted)]">
            {plugin.category}
            {plugin.capabilityCount ? ` · ${plugin.capabilityCount} capabilities` : ''}
          </p>
          <div className="mt-2">
            <Badge tone={statusTone(plugin, checking)} dot={plugin.connected}>
              {statusText(plugin, checking)}
            </Badge>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {showPublishLink ? (
            <Link
              href="/dashboard/publish"
              className="inline-flex h-8 items-center gap-1 rounded-token-md px-2.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              Publish
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ) : null}

          <Button
            size="sm"
            variant={plugin.connected ? 'ghost' : 'secondary'}
            loading={busy}
            disabled={actionDisabled}
            onClick={onAction}
            aria-label={`${actionLabel} ${plugin.name}`}
          >
            {!busy && plugin.connected ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            {actionLabel}
          </Button>
        </div>
      </div>
    </article>
  );
}

function PluginGrid({
  plugins,
  checking,
  connectingId,
  onPreview,
  onAction,
  developerView = false,
}: {
  plugins: readonly PluginRecord[];
  checking: (plugin: PluginRecord) => boolean;
  connectingId: string | null;
  onPreview: (plugin: PluginRecord) => void;
  onAction: (plugin: PluginRecord) => void;
  developerView?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {plugins.map((plugin) => (
        <PluginCard
          key={plugin.id}
          plugin={plugin}
          checking={checking(plugin)}
          busy={connectingId === plugin.id}
          onPreview={() => onPreview(plugin)}
          onAction={() => onAction(plugin)}
          showPublishLink={developerView && plugin.source === 'native'}
        />
      ))}
    </div>
  );
}

function PluginSection({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description?: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
          ) : null}
        </div>
        {typeof count === 'number' ? (
          <span className="shrink-0 text-xs text-[var(--text-muted)]">{count}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-token-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-raised)] px-5 py-8 text-center">
      <Plug className="mx-auto h-5 w-5 text-[var(--text-muted)]" aria-hidden="true" />
      <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-[var(--text-secondary)]">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function PluginPreview({
  plugin,
  checking,
  busy,
  onClose,
  onAction,
}: {
  plugin: PluginRecord;
  checking: boolean;
  busy: boolean;
  onClose: () => void;
  onAction: () => void;
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
      className="fixed inset-0 z-[220] flex items-end justify-center bg-black/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
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
        <div className="flex items-start gap-3 border-b border-[var(--border-subtle)] p-5">
          <PluginLogo id={plugin.id} name={plugin.name} src={plugin.logo} size={44} />
          <div className="min-w-0 flex-1">
            <h2 id="plugin-preview-title" className="text-lg font-semibold text-[var(--text-primary)]">
              {plugin.name}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{plugin.category}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Plugin preview"
            className="grid h-9 w-9 place-items-center rounded-token-md text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <p className="text-sm leading-6 text-[var(--text-secondary)]">{plugin.description}</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3">
              <p className="text-[11px] font-medium text-[var(--text-muted)]">Status</p>
              <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                {statusText(plugin, checking)}
              </p>
            </div>
            <div className="rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3">
              <p className="text-[11px] font-medium text-[var(--text-muted)]">Capabilities</p>
              <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                {plugin.capabilityCount ? plugin.capabilityCount : 'Discovered when needed'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-token-md border border-[var(--border-subtle)] p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
            <p className="text-xs leading-5 text-[var(--text-secondary)]">
              Xroga only uses Plugin capabilities you authorize. Sensitive actions can require confirmation.
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {plugin.source === 'native' ? (
              <Link
                href="/dashboard/publish"
                className="inline-flex h-10 items-center justify-center rounded-token-md border border-[var(--border-subtle)] px-4 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                Open Publish
              </Link>
            ) : null}
            <Button
              variant={plugin.connected ? 'secondary' : 'primary'}
              loading={busy}
              disabled={
                checking ||
                (!plugin.available && plugin.source !== 'credential') ||
                (plugin.connected && plugin.source !== 'credential')
              }
              onClick={onAction}
            >
              {plugin.connected
                ? plugin.source === 'credential'
                  ? 'Manage credentials'
                  : 'Connected'
                : plugin.source === 'credential'
                  ? 'Set up'
                  : 'Connect'}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function PluginMarketplace() {
  const [view, setView] = useState<PluginView>('discover');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [category, setCategory] = useState<PluginCategory>('All');
  const [visibleCount, setVisibleCount] = useState(30);

  const [nativeState, setNativeState] = useState<NativeStateMap>(INITIAL_NATIVE_STATE);
  const [credentialConnected, setCredentialConnected] = useState<Record<string, boolean>>({});
  const [nativeLoading, setNativeLoading] = useState(true);

  const [composioConfigured, setComposioConfigured] = useState<boolean | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [livePlugins, setLivePlugins] = useState<PluginRecord[]>([]);
  const [semanticPlugins, setSemanticPlugins] = useState<PluginRecord[]>([]);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticError, setSemanticError] = useState<string | null>(null);

  const [connectingId, setConnectingId] = useState<string | null>(null);
  const connectingIdRef = useRef<string | null>(null);
  const popupPollRef = useRef<number | null>(null);
  const providerListenerRef = useRef<(() => void) | null>(null);

  const [preview, setPreview] = useState<PluginRecord | null>(null);

  const setConnecting = useCallback((id: string | null) => {
    connectingIdRef.current = id;
    setConnectingId(id);
  }, []);

  const clearPopupPoll = useCallback(() => {
    if (popupPollRef.current !== null) {
      window.clearInterval(popupPollRef.current);
      popupPollRef.current = null;
    }
  }, []);

  const refreshNativeConnections = useCallback(async () => {
    setNativeLoading(true);

    const [github, vercel, supabase, providerKeys] = await Promise.allSettled([
      api.github.status(),
      api.vercel.status(),
      api.supabase.status(),
      api.integrations.providerKeys(),
    ]);

    setNativeState({
      github: {
        connected:
          github.status === 'fulfilled' ? Boolean(github.value.connected) : false,
        statusMessage:
          github.status === 'fulfilled' && github.value.connected
            ? github.value.username
              ? `@${github.value.username}`
              : 'Connected'
            : github.status === 'rejected'
              ? 'Status unavailable'
              : undefined,
      },
      vercel: {
        connected:
          vercel.status === 'fulfilled'
            ? Boolean(vercel.value.connected || vercel.value.managedDeployAvailable)
            : false,
        statusMessage:
          vercel.status === 'fulfilled'
            ? vercel.value.managedDeployAvailable
              ? 'Managed publishing ready'
              : vercel.value.username
                ? `@${vercel.value.username}`
                : vercel.value.warning
            : 'Status unavailable',
      },
      supabase: {
        connected:
          supabase.status === 'fulfilled'
            ? Boolean(
                supabase.value.oauthConnected ||
                  supabase.value.connected ||
                  supabase.value.provisioned ||
                  supabase.value.ready,
              )
            : false,
        statusMessage:
          supabase.status === 'fulfilled'
            ? supabase.value.provisioned || supabase.value.ready
              ? 'Project ready'
              : supabase.value.oauthConnected
                ? 'Authorized'
                : supabase.value.message
            : 'Status unavailable',
      },
    });

    const connectedCredentials: Record<string, boolean> = {};
    if (providerKeys.status === 'fulfilled') {
      for (const key of providerKeys.value.keys ?? []) {
        if (!key.provider || !key.connected) continue;
        connectedCredentials[canonicalPluginId(String(key.provider))] = true;
      }
    }
    setCredentialConnected(connectedCredentials);
    setNativeLoading(false);
  }, []);

  const refreshComposioDiscovery = useCallback(
    async (preferredSession?: string | null) => {
      try {
        const result = await xrogaConnect.search(
          POPULAR_DISCOVERY_QUERY,
          preferredSession ?? sessionId ?? undefined,
        );
        setSessionId(result.sessionId);
        setLivePlugins((current) =>
          mergePluginRecords(current, searchPlugins(result)),
        );
        setSemanticError(null);
        return result;
      } catch (error) {
        setSemanticError(
          error instanceof Error ? error.message : 'Business Plugins are temporarily unavailable.',
        );
        return null;
      }
    },
    [sessionId],
  );

  useEffect(() => {
    let active = true;

    void refreshNativeConnections();

    void xrogaConnect
      .status()
      .then(async (status) => {
        if (!active) return;
        setComposioConfigured(status.configured);

        if (status.configured) {
          await refreshComposioDiscovery();
        }
      })
      .catch(() => {
        if (!active) return;
        setComposioConfigured(false);
      });

    return () => {
      active = false;
    };
  }, [refreshComposioDiscovery, refreshNativeConnections]);

  useEffect(() => {
    return () => {
      clearPopupPoll();
      providerListenerRef.current?.();
      providerListenerRef.current = null;
    };
  }, [clearPopupPoll]);

  useEffect(() => {
    const unsubscribe = subscribeOAuthResults((payload) => {
      if (payload.type === 'xroga-composio-connected') {
        clearPopupPoll();
        setConnecting(null);
        toast.success(payload.message || 'Plugin connected to Xroga');
        void refreshComposioDiscovery();
      } else if (payload.type === 'xroga-composio-error') {
        clearPopupPoll();
        setConnecting(null);
        toast.error(payload.message || 'Plugin connection failed');
      } else if (payload.type === 'xroga-github-connected') {
        setConnecting(null);
        toast.success(
          payload.username ? `GitHub connected as @${payload.username}` : 'GitHub connected',
        );
        void refreshNativeConnections();
      } else if (payload.type === 'xroga-github-error') {
        setConnecting(null);
        toast.error(payload.message || 'GitHub connection failed');
      }
    });

    return unsubscribe;
  }, [clearPopupPoll, refreshComposioDiscovery, refreshNativeConnections, setConnecting]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const vercel = params.get('vercel');
    const github = params.get('github');
    const supabase = params.get('supabase');
    const composio = params.get('composio');
    const message = params.get('message');
    const username = params.get('username');
    const focus = params.get('focus');

    if (vercel === 'connected') {
      toast.success(username ? `Vercel connected as @${username}` : 'Vercel connected');
      void refreshNativeConnections();
    } else if (vercel === 'error' || vercel === 'missing_code') {
      toast.error(message || 'Vercel authorization failed — try again');
    }

    if (github === 'connected') {
      toast.success(username ? `GitHub connected as @${username}` : 'GitHub connected');
      void refreshNativeConnections();
    } else if (github === 'error' || github === 'missing_code') {
      toast.error(message || 'GitHub authorization failed — try again');
    }

    if (supabase === 'connected') {
      toast.success('Supabase authorized');
      setView('developer');
      void refreshNativeConnections();
    } else if (supabase === 'error' || supabase === 'missing_code') {
      toast.error(message || 'Supabase authorization failed — try again');
    }

    if (composio === 'connected') {
      toast.success('Plugin connected to Xroga');
      void refreshComposioDiscovery();
    } else if (composio === 'error') {
      toast.error(message || 'Plugin connection failed');
    }

    if (focus === 'vercel' || vercel === 'setup') {
      setView('developer');
    }

    if (vercel || github || supabase || composio || focus) {
      const url = new URL(window.location.href);
      [
        'vercel',
        'github',
        'supabase',
        'composio',
        'message',
        'username',
        'pick',
        'focus',
      ].forEach((key) => url.searchParams.delete(key));
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, [refreshComposioDiscovery, refreshNativeConnections]);

  useEffect(() => {
    const clean = deferredQuery.trim();

    if (clean.length < 2 || composioConfigured !== true) {
      setSemanticPlugins([]);
      setSemanticLoading(false);
      if (clean.length < 2) setSemanticError(null);
      return;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      setSemanticLoading(true);
      setSemanticError(null);

      void xrogaConnect
        .search(clean, sessionId ?? undefined)
        .then((result) => {
          if (!active) return;
          setSessionId(result.sessionId);
          const plugins = searchPlugins(result);
          setSemanticPlugins(plugins);
          setLivePlugins((current) => mergePluginRecords(current, plugins));
        })
        .catch((error) => {
          if (!active) return;
          setSemanticPlugins([]);
          setSemanticError(
            error instanceof Error
              ? error.message
              : 'Live Plugin search is temporarily unavailable.',
          );
        })
        .finally(() => {
          if (active) setSemanticLoading(false);
        });
    }, 320);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [composioConfigured, deferredQuery, sessionId]);

  useEffect(() => {
    setVisibleCount(30);
  }, [category, query, view]);

  const nativePlugins = useMemo(
    () =>
      NATIVE_PLUGIN_SEEDS.map((seed) =>
        pluginFromSeed(seed, {
          connected: nativeState[seed.id as keyof NativeStateMap]?.connected === true,
          statusMessage: nativeState[seed.id as keyof NativeStateMap]?.statusMessage,
          resolved: nativeState[seed.id as keyof NativeStateMap]?.connected !== null,
        }),
      ),
    [nativeState],
  );

  const composioSeeds = useMemo(
    () =>
      composioConfigured === false
        ? []
        : COMPOSIO_PLUGIN_SEEDS.map((seed) =>
            pluginFromSeed(seed, {
              connected: false,
              resolved: false,
              available: composioConfigured !== false,
              toolkit: seed.toolkitHint,
            }),
          ),
    [composioConfigured],
  );

  const credentialPlugins = useMemo(
    () =>
      CREDENTIAL_PLUGIN_SEEDS.map((seed) =>
        pluginFromSeed(seed, {
          connected: Boolean(credentialConnected[seed.id]),
          statusMessage: credentialConnected[seed.id] ? 'Credential saved' : undefined,
        }),
      ),
    [credentialConnected],
  );

  const allPlugins = useMemo(
    () => mergePluginRecords(nativePlugins, composioSeeds, credentialPlugins, livePlugins),
    [credentialPlugins, composioSeeds, livePlugins, nativePlugins],
  );

  const connectedPlugins = useMemo(
    () => allPlugins.filter((plugin) => plugin.connected),
    [allPlugins],
  );

  const popularPlugins = useMemo(
    () =>
      allPlugins
        .filter((plugin) => plugin.popular && plugin.available)
        .sort((a, b) => Number(b.connected) - Number(a.connected)),
    [allPlugins],
  );

  const allDiscoverPlugins = useMemo(() => {
    const filtered =
      category === 'All'
        ? allPlugins
        : allPlugins.filter((plugin) => plugin.category === category);

    return filtered
      .filter((plugin) => plugin.available)
      .sort(
        (a, b) =>
          Number(b.connected) - Number(a.connected) ||
          Number(b.popular) - Number(a.popular) ||
          a.name.localeCompare(b.name),
      );
  }, [allPlugins, category]);

  const queryResults = useMemo(() => {
    if (!query.trim()) return [];

    const local = rankPlugins(allPlugins, query);
    const merged = mergePluginRecords(semanticPlugins, local);
    const ranked = rankPlugins(merged, query);

    return category === 'All'
      ? ranked
      : ranked.filter((plugin) => plugin.category === category);
  }, [allPlugins, category, query, semanticPlugins]);

  const developerPlugins = useMemo(
    () =>
      allPlugins.filter(
        (plugin) =>
          plugin.developer ||
          plugin.category === 'Engineering' ||
          plugin.category === 'Infrastructure',
      ),
    [allPlugins],
  );

  const isChecking = useCallback(
    (plugin: PluginRecord) => {
      if (plugin.source === 'native') {
        return nativeState[plugin.id as keyof NativeStateMap]?.connected === null;
      }
      return plugin.source === 'composio' && composioConfigured === null;
    },
    [composioConfigured, nativeState],
  );

  const mergeSearchResult = useCallback((result: XrogaConnectSearchResult) => {
    const plugins = searchPlugins(result);
    setSessionId(result.sessionId);
    setLivePlugins((current) => mergePluginRecords(current, plugins));
    return plugins;
  }, []);

  const startComposioConnection = useCallback(
    async (plugin: PluginRecord) => {
      if (connectingIdRef.current) return;
      setConnecting(plugin.id);
      clearOAuthResult();

      let popup: Window | null = null;

      try {
        let activeSession = sessionId;
        let resolvedPlugin = plugin;

        if (!resolvedPlugin.resolved || !resolvedPlugin.toolkit) {
          const seed = seedForPlugin(plugin.id);
          const result = await xrogaConnect.search(
            seed?.searchQuery || plugin.searchQuery || `find ${plugin.name} capabilities`,
            activeSession ?? undefined,
          );

          activeSession = result.sessionId;
          const discovered = mergeSearchResult(result);
          resolvedPlugin =
            discovered.find((candidate) => candidate.id === plugin.id) ||
            discovered[0] ||
            plugin;
        }

        if (!activeSession || !resolvedPlugin.toolkit) {
          throw new Error(`${plugin.name} is not available through Xroga Connect yet.`);
        }

        popup = window.open(
          '',
          'xroga-connect-oauth',
          'width=600,height=760,resizable=yes,scrollbars=yes',
        );

        const link = await xrogaConnect.link(activeSession, resolvedPlugin.toolkit);

        if (!link.redirectUrl) {
          throw new Error('Authorization link was not returned.');
        }

        if (popup) {
          popup.location.href = link.redirectUrl;
          popup.focus();

          clearPopupPoll();
          popupPollRef.current = window.setInterval(() => {
            if (!popup || popup.closed) {
              clearPopupPoll();
              if (connectingIdRef.current === plugin.id) {
                setConnecting(null);
              }
            }
          }, 500);
        } else {
          window.location.assign(link.redirectUrl);
        }
      } catch (error) {
        try {
          popup?.close();
        } catch {
          // Ignore popup cleanup failures.
        }

        clearPopupPoll();
        setConnecting(null);
        toast.error(
          error instanceof Error ? error.message : `Could not connect ${plugin.name}`,
        );
      }
    },
    [clearPopupPoll, mergeSearchResult, sessionId, setConnecting],
  );

  const startNativeConnection = useCallback(
    async (plugin: PluginRecord) => {
      if (connectingIdRef.current) return;
      setConnecting(plugin.id);

      if (plugin.id === 'github') {
        const result = await openGitHubOAuthPopup();
        if (!result.opened) {
          setConnecting(null);
          toast.error(result.error || 'Could not start GitHub authorization');
        }
        return;
      }

      if (plugin.id === 'vercel') {
        try {
          const { openVercelOAuthPopup } = await import('@/lib/vercelConnect');
          const result = await openVercelOAuthPopup();

          if (!result.opened) {
            setConnecting(null);
            toast.error(result.error || 'Could not start Vercel authorization');
          }
        } catch (error) {
          setConnecting(null);
          toast.error(
            error instanceof Error ? error.message : 'Could not start Vercel authorization',
          );
        }
        return;
      }

      if (plugin.id === 'supabase') {
        try {
          providerListenerRef.current?.();
          const { openSupabaseOAuthPopup, listenSupabaseOAuthMessages } = await import(
            '@/lib/supabaseConnect'
          );

          providerListenerRef.current = listenSupabaseOAuthMessages(
            (result) => {
              providerListenerRef.current = null;
              setConnecting(null);
              toast.success(result.message || 'Supabase authorized');
              void refreshNativeConnections();
            },
            (message) => {
              providerListenerRef.current = null;
              setConnecting(null);
              toast.error(message);
            },
          );

          const result = await openSupabaseOAuthPopup();

          if (!result.opened) {
            providerListenerRef.current?.();
            providerListenerRef.current = null;
            setConnecting(null);
            toast.error(result.error || 'Could not start Supabase authorization');
          }
        } catch (error) {
          providerListenerRef.current?.();
          providerListenerRef.current = null;
          setConnecting(null);
          toast.error(
            error instanceof Error ? error.message : 'Could not start Supabase authorization',
          );
        }
      }
    },
    [refreshNativeConnections, setConnecting],
  );

  const handlePluginAction = useCallback(
    (plugin: PluginRecord) => {
      if (plugin.source === 'credential') {
        setPreview(null);
        setView('custom');
        requestAnimationFrame(() => {
          document.getElementById('plugin-custom-credentials')?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        });
        return;
      }

      if (plugin.connected) return;

      if (plugin.source === 'native') {
        void startNativeConnection(plugin);
      } else {
        void startComposioConnection(plugin);
      }
    },
    [startComposioConnection, startNativeConnection],
  );

  const visibleDiscoverPlugins = allDiscoverPlugins.slice(0, visibleCount);
  const visibleSearchResults = queryResults.slice(0, visibleCount);

  return (
    <div className="space-y-8">
      <header className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-[28px]">
                Plugins
              </h1>
              {connectedPlugins.length > 0 ? (
                <Badge tone="success">{connectedPlugins.length} connected</Badge>
              ) : null}
            </div>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              Connect the tools Xroga can securely work with. Search by app or describe what you want Xroga to do.
            </p>
          </div>

          <Button
            variant="secondary"
            onClick={() => setView('custom')}
            className="w-full sm:w-auto"
          >
            <Plug className="h-4 w-4" aria-hidden="true" />
            Add plugin
          </Button>
        </div>

        <label className="relative block">
          <span className="sr-only">Search Plugins</span>
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (view !== 'discover') setView('discover');
            }}
            placeholder="Search plugins or describe what you want Xroga to do…"
            className="h-12 w-full rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] pl-11 pr-11 text-sm text-[var(--text-primary)] shadow-subtle outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus-visible:shadow-[var(--focus-ring)]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear Plugin search"
              className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-token-sm text-[var(--text-muted)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </label>

        <div className="flex items-center gap-1 overflow-x-auto pb-1" aria-label="Plugin views">
          {PLUGIN_VIEWS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setView(item);
                if (item !== 'discover') setQuery('');
              }}
              aria-pressed={view === item}
              className={cn(
                'shrink-0 rounded-token-sm px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                view === item
                  ? 'bg-[var(--accent-dim)] text-[var(--accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]',
              )}
            >
              {VIEW_LABELS[item]}
            </button>
          ))}
        </div>
      </header>

      {view === 'discover' ? (
        <div className="space-y-9">
          {query.trim() ? (
            <>
              <div className="flex flex-wrap items-center gap-2 overflow-x-auto">
                {PLUGIN_CATEGORIES.slice(0, 9).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    aria-pressed={category === item}
                    className={cn(
                      'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                      category === item
                        ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
                        : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-inset)]',
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <PluginSection
                title={`Search results for “${query.trim()}”`}
                description={
                  semanticLoading
                    ? 'Checking live Plugin capabilities…'
                    : semanticError
                      ? 'Showing local matches while live capability search is unavailable.'
                      : 'Matches combine Plugin names, categories and live capability search.'
                }
                count={visibleSearchResults.length}
              >
                {visibleSearchResults.length > 0 ? (
                  <PluginGrid
                    plugins={visibleSearchResults}
                    checking={isChecking}
                    connectingId={connectingId}
                    onPreview={setPreview}
                    onAction={handlePluginAction}
                  />
                ) : semanticLoading ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <PluginSkeleton key={index} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title={`No Plugin found for “${query.trim()}”`}
                    body="Try another search, or request the Plugin through Xroga Community."
                    action={
                      <Link
                        href="/community"
                        className="inline-flex h-9 items-center justify-center rounded-token-md border border-[var(--border-subtle)] px-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)]"
                      >
                        Request this Plugin
                      </Link>
                    }
                  />
                )}

                {queryResults.length > visibleCount ? (
                  <div className="pt-2 text-center">
                    <Button variant="secondary" onClick={() => setVisibleCount((count) => count + 30)}>
                      Show more
                    </Button>
                  </div>
                ) : null}
              </PluginSection>
            </>
          ) : (
            <>
              <PluginSection
                title="Connected"
                description="Plugins ready for Xroga to use when you ask."
                count={connectedPlugins.length}
              >
                {nativeLoading && connectedPlugins.length === 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <PluginSkeleton key={index} />
                    ))}
                  </div>
                ) : connectedPlugins.length > 0 ? (
                  <PluginGrid
                    plugins={connectedPlugins.slice(0, 6)}
                    checking={isChecking}
                    connectingId={connectingId}
                    onPreview={setPreview}
                    onAction={handlePluginAction}
                  />
                ) : (
                  <EmptyState
                    title="No Plugins connected yet"
                    body="Browse the Plugins below and connect the tools you use. GitHub is no longer required before you can use business Plugins."
                  />
                )}
              </PluginSection>

              <PluginSection
                title="Popular"
                description="Common tools for building, operating and growing with Xroga."
              >
                {composioConfigured === null && popularPlugins.length <= 3 ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <PluginSkeleton key={index} />
                    ))}
                  </div>
                ) : (
                  <PluginGrid
                    plugins={popularPlugins.slice(0, 12)}
                    checking={isChecking}
                    connectingId={connectingId}
                    onPreview={setPreview}
                    onAction={handlePluginAction}
                  />
                )}
              </PluginSection>

              <PluginSection
                title="Categories"
                description="Browse Plugins by the job they help Xroga perform."
              >
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {PLUGIN_CATEGORIES.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setCategory(item)}
                      aria-pressed={category === item}
                      className={cn(
                        'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                        category === item
                          ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
                          : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-inset)]',
                      )}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </PluginSection>

              <PluginSection
                title="All Plugins"
                description="Available Plugins are shown first. Search above to discover more capabilities through Xroga Connect."
                count={allDiscoverPlugins.length}
              >
                <PluginGrid
                  plugins={visibleDiscoverPlugins}
                  checking={isChecking}
                  connectingId={connectingId}
                  onPreview={setPreview}
                  onAction={handlePluginAction}
                />

                {allDiscoverPlugins.length > visibleCount ? (
                  <div className="pt-2 text-center">
                    <Button variant="secondary" onClick={() => setVisibleCount((count) => count + 30)}>
                      Show more
                    </Button>
                  </div>
                ) : null}

                {semanticError ? (
                  <div
                    role="status"
                    className="rounded-token-md border border-[var(--warning-dim)] bg-[var(--warning-dim)] px-4 py-3 text-xs leading-5 text-[var(--text-secondary)]"
                  >
                    Business Plugin discovery is temporarily limited. Native Plugins remain available, and local search still works.
                  </div>
                ) : null}
              </PluginSection>
            </>
          )}
        </div>
      ) : null}

      {view === 'connected' ? (
        <PluginSection
          title="Connected Plugins"
          description="A focused view of the accounts and services currently available to Xroga."
          count={connectedPlugins.length}
        >
          {connectedPlugins.length > 0 ? (
            <PluginGrid
              plugins={connectedPlugins}
              checking={isChecking}
              connectingId={connectingId}
              onPreview={setPreview}
              onAction={handlePluginAction}
            />
          ) : nativeLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <PluginSkeleton key={index} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No Plugins connected yet"
              body="Open Discover and connect the tools you want Xroga to work with."
              action={
                <Button variant="secondary" size="sm" onClick={() => setView('discover')}>
                  Browse Plugins
                </Button>
              }
            />
          )}
        </PluginSection>
      ) : null}

      {view === 'developer' ? (
        <PluginSection
          title="Developer Plugins"
          description="Code, infrastructure and monitoring tools. Publishing remains a separate workflow."
          count={developerPlugins.length}
        >
          <PluginGrid
            plugins={developerPlugins}
            checking={isChecking}
            connectingId={connectingId}
            onPreview={setPreview}
            onAction={handlePluginAction}
            developerView
          />
        </PluginSection>
      ) : null}

      {view === 'custom' ? (
        <div id="plugin-custom-credentials" className="space-y-7">
          <PluginSection
            title="Custom Plugins"
            description="Step 1 keeps the existing secure credential system live. The full custom MCP builder arrives in the next Plugins stage."
          >
            <div className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-token-md bg-[var(--accent-dim)] text-[var(--accent)]">
                  <Plug className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Bring your own credentials</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                    Existing vault-backed API keys and service credentials remain available here without exposing secrets in the Plugin catalogue.
                  </p>
                </div>
              </div>
            </div>
          </PluginSection>

          <ConnectedServicesSection />
          <CustomCredentialsSection />
        </div>
      ) : null}

      <footer className="flex items-start gap-2 border-t border-[var(--border-subtle)] pt-5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
        <p className="text-xs leading-5 text-[var(--text-muted)]">
          Xroga only takes actions you authorize. Sensitive, destructive, financial or permission-changing actions can require confirmation.
        </p>
      </footer>

      {preview ? (
        <PluginPreview
          plugin={preview}
          checking={isChecking(preview)}
          busy={connectingId === preview.id}
          onClose={() => setPreview(null)}
          onAction={() => handlePluginAction(preview)}
        />
      ) : null}
    </div>
  );
}
