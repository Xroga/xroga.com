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
  KeyRound,
  Loader2,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { ConnectedServicesSection } from '@/components/integrations/ConnectedServicesSection';
import { CustomCredentialsSection } from '@/components/integrations/CustomCredentialsSection';
import {
  CustomMcpCreateForm,
  CustomMcpManager,
} from '@/components/integrations/CustomMcpManager';
import { PluginBrandLogo } from '@/components/integrations/PluginBrandLogo';
import { Dialog } from '@/components/ui/Dialog';
import { api } from '@/lib/api';
import {
  PLUGIN_DEFINITIONS,
  authSummary,
  canonicalPluginId,
  genericPluginDefinition,
  inferCategory,
  pluginFromCatalog,
  pluginSearchScore,
  type ConnectionState,
  type NativePluginId,
  type PluginCategoryGroupId,
  type PluginView,
  type RuntimePlugin,
} from '@/lib/pluginCatalog';
import {
  clearOAuthResult,
  subscribeOAuthResults,
} from '@/lib/oauthPopupResult';
import {
  xrogaConnect,
  type XrogaConnectCatalogToolkit,
  type XrogaConnectToolkit,
} from '@/lib/xrogaConnect';

type NativeSnapshot = {
  state: ConnectionState;
  accountLabel?: string;
  statusMessage?: string;
};

type ConnectedFilter = 'all' | 'apps' | 'developer' | 'attention';

const BROWSE_PAGE_SIZE = 250;
const SEARCH_PAGE_SIZE = 100;
const CATEGORY_PREVIEW_LIMIT = 6;

type DiscoverySection = {
  id: string;
  title: string;
  description: string;
  categories: string[];
  groups: Exclude<PluginCategoryGroupId, ''>[];
};

const DISCOVERY_SECTIONS: DiscoverySection[] = [
  {
    id: 'small-business',
    title: 'Small Business',
    description: 'Commerce, payments, finance and marketing tools for operating a business.',
    categories: ['Commerce', 'Finance', 'Marketing'],
    groups: ['commerce', 'finance', 'marketing'],
  },
  {
    id: 'productivity',
    title: 'Productivity',
    description: 'Calendar, documents, tasks, workspace and personal productivity apps.',
    categories: ['Productivity'],
    groups: ['productivity'],
  },
  {
    id: 'creativity',
    title: 'Creativity',
    description: 'Design, image, video, audio, media and creative production tools.',
    categories: ['Design & Media'],
    groups: ['design-media'],
  },
  {
    id: 'developer-tools',
    title: 'Developer Tools',
    description: 'Code, deployment, infrastructure, monitoring and developer services.',
    categories: ['Engineering', 'Infrastructure'],
    groups: ['engineering', 'infrastructure'],
  },
  {
    id: 'business-operations',
    title: 'Business & Operations',
    description: 'CRM, customer support, recruiting and day-to-day business systems.',
    categories: ['Sales & CRM', 'Support', 'HR & Recruiting'],
    groups: ['sales-crm', 'support', 'hr-recruiting'],
  },
  {
    id: 'data-analytics',
    title: 'Data & Analytics',
    description: 'Databases, analytics, spreadsheets, BI and data platforms.',
    categories: ['Data & Analytics'],
    groups: ['data-analytics'],
  },
  {
    id: 'communication',
    title: 'Communication',
    description: 'Messaging, email, meetings, communities and collaboration.',
    categories: ['Communication'],
    groups: ['communication'],
  },
  {
    id: 'ai-automation',
    title: 'AI & Automation',
    description: 'AI models, agents, automation and workflow tools.',
    categories: ['AI & Automation'],
    groups: ['ai-automation'],
  },
  {
    id: 'travel',
    title: 'Travel',
    description: 'Flights, trips, navigation, booking and travel services.',
    categories: ['Travel'],
    groups: ['other'],
  },
  {
    id: 'entertainment',
    title: 'Entertainment',
    description: 'Music, media, games, sports and entertainment services.',
    categories: ['Entertainment'],
    groups: ['other'],
  },
  {
    id: 'other',
    title: 'Other',
    description: 'More supported apps that do not fit the main categories.',
    categories: ['Other'],
    groups: ['other'],
  },
]

function viewFrom(value: string | null): PluginView {
  if (value === 'connected' || value === 'developer' || value === 'custom') return value;
  return 'discover';
}

function detailHref(plugin: RuntimePlugin): string {
  return `/dashboard/integrations/${encodeURIComponent(plugin.toolkit || plugin.id)}`;
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
    <article className="group flex min-h-[166px] flex-col rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-subtle motion-reduce:transform-none">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={detailHref(plugin)}
          className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          aria-label={`View ${plugin.name} Plugin details`}
        >
          <PluginBrandLogo
            id={plugin.id}
            name={plugin.name}
            toolkit={plugin.toolkit}
            logo={plugin.logo}
            fallbackLogo={plugin.logoFallback}
          />
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-[var(--text-primary)]">
              {plugin.name}
            </h3>
            <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
              {plugin.category}
            </p>
          </div>
        </Link>

        {plugin.connected || plugin.noAuth ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)]">
            <Check className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
            {plugin.noAuth ? 'Ready' : 'Connected'}
          </span>
        ) : needsAttention ? (
          <Link
            href={detailHref(plugin)}
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
            ) : null}
            {checking ? 'Checking' : connecting ? 'Connecting' : 'Connect'}
          </button>
        )}
      </div>

      <Link
        href={detailHref(plugin)}
        className="mt-3 line-clamp-2 rounded-md text-sm leading-5 text-[var(--text-secondary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        {plugin.description}
      </Link>

      <div className="mt-auto flex items-end justify-between gap-2 pt-3">
        <div className="min-w-0 space-y-0.5">
          {plugin.accountLabel ? (
            <p className="truncate text-[11px] font-medium text-[var(--text-primary)]">
              {plugin.accountLabel}
            </p>
          ) : null}
          <p className="truncate text-[11px] text-[var(--text-muted)]">
            {plugin.toolsCount !== undefined
              ? `${plugin.toolsCount.toLocaleString()} actions`
              : plugin.capabilityCount
                ? `${plugin.capabilityCount.toLocaleString()} actions`
                : plugin.source === 'native'
                  ? 'Xroga native'
                  : authSummary(plugin)}
            {plugin.triggersCount ? ` · ${plugin.triggersCount.toLocaleString()} triggers` : ''}
          </p>
          {plugin.source === 'composio' && !plugin.noAuth ? (
            <p className="truncate text-[10px] text-[var(--text-muted)]">{authSummary(plugin)}</p>
          ) : null}
        </div>

        <Link
          href={detailHref(plugin)}
          className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:underline"
        >
          {plugin.connected ? 'Manage' : 'View details'}
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

function PluginListRow({
  plugin,
  connecting,
  onConnect,
}: {
  plugin: RuntimePlugin;
  connecting: boolean;
  onConnect: (plugin: RuntimePlugin) => void;
}) {
  const checking = plugin.connectionState === 'checking';

  return (
    <div className="group flex min-h-[72px] items-center gap-3 border-b border-[var(--border-subtle)] py-3 last:border-b-0">
      <Link
        href={detailHref(plugin)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <PluginBrandLogo
          id={plugin.id}
          name={plugin.name}
          toolkit={plugin.toolkit}
          logo={plugin.logo}
          fallbackLogo={plugin.logoFallback}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {plugin.name}
          </p>
          <p className="mt-0.5 line-clamp-1 text-xs text-[var(--text-secondary)]">
            {plugin.description}
          </p>
        </div>
      </Link>

      {plugin.connected || plugin.noAuth ? (
        <Link
          href={detailHref(plugin)}
          aria-label={`Manage ${plugin.name}`}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-primary)] transition hover:bg-[var(--surface-inset)]"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => onConnect(plugin)}
          disabled={connecting || checking}
          aria-label={`Connect ${plugin.name}`}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-[var(--text-primary)] transition hover:bg-[var(--surface-inset)] disabled:opacity-50"
        >
          {connecting || checking ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <span aria-hidden="true">+</span>
          )}
        </button>
      )}
    </div>
  );
}

function PluginListGrid({
  plugins,
  connectingId,
  onConnect,
}: {
  plugins: RuntimePlugin[];
  connectingId: string | null;
  onConnect: (plugin: RuntimePlugin) => void;
}) {
  return (
    <div className="grid gap-x-10 lg:grid-cols-2">
      {plugins.map((plugin) => (
        <PluginListRow
          key={plugin.toolkit || plugin.id}
          plugin={plugin}
          connecting={connectingId === (plugin.toolkit || plugin.id)}
          onConnect={onConnect}
        />
      ))}
    </div>
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
          key={plugin.toolkit || plugin.id}
          plugin={plugin}
          connecting={connectingId === (plugin.toolkit || plugin.id)}
          onConnect={onConnect}
        />
      ))}
    </div>
  );
}

function CategoryPluginSection({
  section,
  plugins,
  expanded,
  loading,
  error,
  connectingId,
  onConnect,
  onToggle,
}: {
  section: DiscoverySection;
  plugins: RuntimePlugin[];
  expanded: boolean;
  loading: boolean;
  error?: string;
  connectingId: string | null;
  onConnect: (plugin: RuntimePlugin) => void;
  onToggle: () => void;
}) {
  const visible = expanded ? plugins : plugins.slice(0, CATEGORY_PREVIEW_LIMIT);

  return (
    <section className="border-b border-[var(--border-subtle)] pb-7 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="group mb-2 flex w-full items-start justify-between gap-4 rounded-md text-left focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
              {section.title}
            </h3>
            <ChevronRight
              className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${expanded ? 'rotate-90' : ''}`}
              aria-hidden="true"
            />
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            {section.description}
          </p>
        </div>
        {plugins.length ? (
          <span className="shrink-0 pt-0.5 text-[11px] font-medium text-[var(--text-muted)]">
            {expanded ? `${plugins.length.toLocaleString()} apps` : 'See all'}
          </span>
        ) : null}
      </button>

      {loading && !visible.length ? (
        <div className="grid gap-x-10 lg:grid-cols-2" aria-label={`Loading ${section.title}`}>
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div
              key={item}
              className="h-[72px] animate-pulse border-b border-[var(--border-subtle)] bg-[var(--surface-inset)]/35"
            />
          ))}
        </div>
      ) : visible.length ? (
        <PluginListGrid
          plugins={visible}
          connectingId={connectingId}
          onConnect={onConnect}
        />
      ) : (
        <div className="rounded-token-md border border-dashed border-[var(--border-subtle)] px-4 py-4 text-xs leading-5 text-[var(--text-secondary)]">
          {error
            ? error
            : expanded
              ? 'No apps are currently classified in this category.'
              : 'Open this category to load its supported apps.'}
        </div>
      )}
    </section>
  );
}

function mergePlugins(
  plugins: RuntimePlugin[],
): RuntimePlugin[] {
  const byKey = new Map<string, RuntimePlugin>();

  for (const plugin of plugins) {
    const key = plugin.toolkit || plugin.id;
    const current = byKey.get(key);

    if (!current) {
      byKey.set(key, plugin);
      continue;
    }

    byKey.set(key, {
      ...current,
      ...plugin,
      connected: current.connected || plugin.connected,
      logo: plugin.logo || current.logo,
      toolsCount: plugin.toolsCount ?? current.toolsCount,
      triggersCount: plugin.triggersCount ?? current.triggersCount,
    });
  }

  return [...byKey.values()];
}

export function PluginMarketplace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [view, setViewState] = useState<PluginView>(() => viewFrom(searchParams.get('view')));
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const deferredQuery = useDeferredValue(query.trim());
  const [catalogItems, setCatalogItems] = useState<XrogaConnectCatalogToolkit[]>([]);
  const [globalCatalogTotal, setGlobalCatalogTotal] = useState<number | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const [searchCatalogItems, setSearchCatalogItems] = useState<XrogaConnectCatalogToolkit[]>([]);
  const [semanticCatalogItems, setSemanticCatalogItems] = useState<XrogaConnectCatalogToolkit[]>([]);
  const [semanticToolkitSlugs, setSemanticToolkitSlugs] = useState<Set<string>>(new Set());
  const [searchLoading, setSearchLoading] = useState(false);
  const [semanticError, setSemanticError] = useState(false);

  const [nativeState, setNativeState] = useState<Record<NativePluginId, NativeSnapshot>>({
    github: { state: 'checking' },
    vercel: { state: 'checking' },
    supabase: { state: 'checking' },
  });
  const [composioConfigured, setComposioConfigured] = useState<boolean | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [toolkitConnections, setToolkitConnections] = useState<Record<string, XrogaConnectToolkit>>({});
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectedOverrides, setConnectedOverrides] = useState<Record<string, boolean>>({});
  const [connectedQuery, setConnectedQuery] = useState('');
  const [connectedFilter, setConnectedFilter] = useState<ConnectedFilter>('all');
  const requestSeq = useRef(0);
  const [addPluginOpen, setAddPluginOpen] = useState(false);
  const [addPluginMode, setAddPluginMode] = useState<
    'menu' | 'mcp' | 'credentials'
  >('menu');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [sectionCatalog, setSectionCatalog] = useState<Record<string, XrogaConnectCatalogToolkit[]>>({});
  const [sectionLoading, setSectionLoading] = useState<Record<string, boolean>>({});
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({});

  const setView = (next: PluginView) => {
    setViewState(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'discover') params.delete('view');
    else params.set('view', next);
    const suffix = params.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
  };

  const focusPluginSearch = () => {
    setAddPluginMode('menu');
    setAddPluginOpen(false);
    setView('discover');
    window.setTimeout(() => {
      const input = document.getElementById('plugin-marketplace-search') as HTMLInputElement | null;
      input?.focus();
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
  };

  const openCredentials = () => {
    setAddPluginMode('menu');
    setAddPluginOpen(false);
    setView('custom');
    window.setTimeout(() => {
      document.getElementById('custom-plugin-options')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 0);
  };

  const refreshNativeStatus = () => {
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

  const absorbConnections = (toolkits: XrogaConnectToolkit[]) => {
    if (!toolkits.length) return;

    setToolkitConnections((current) => {
      const next = { ...current };
      for (const toolkit of toolkits) {
        next[toolkit.toolkit] = toolkit;
      }
      return next;
    });
  };

  useEffect(() => {
    refreshNativeStatus();

    let active = true;

    void xrogaConnect
      .status()
      .then(async (availability) => {
        if (!active) return;
        setComposioConfigured(availability.configured);

        if (!availability.configured) {
          setCatalogLoading(false);
          return;
        }

        const [catalogResult, sessionResult] = await Promise.allSettled([
          xrogaConnect.catalog({
            sortBy: 'usage',
            limit: BROWSE_PAGE_SIZE,
          }),
          xrogaConnect.session(),
        ]);

        if (!active) return;

        if (catalogResult.status === 'fulfilled') {
          setCatalogItems(catalogResult.value.items);
          setGlobalCatalogTotal(catalogResult.value.totalItems);
        }
        setCatalogLoading(false);

        if (sessionResult.status === 'fulfilled') {
          setSessionId(sessionResult.value.sessionId);
          try {
            const connected = await xrogaConnect.toolkits(sessionResult.value.sessionId, {
              connectedOnly: true,
            });
            if (active) absorbConnections(connected.toolkits ?? []);
          } catch {
            // Catalogue browsing remains available when connection status lookup fails.
          }
        }
      })
      .catch(() => {
        if (!active) return;
        setComposioConfigured(false);
        setCatalogLoading(false);
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
            setConnectedOverrides((current) => ({
              ...current,
              [connectingId]: true,
            }));
          }
          setConnectingId(null);
          toast.success('Plugin connected to Xroga');

          if (sessionId) {
            void xrogaConnect
              .toolkits(sessionId, { connectedOnly: true })
              .then((result) => absorbConnections(result.toolkits ?? []))
              .catch(() => undefined);
          }
        }

        if (payload.type === 'xroga-composio-error') {
          setConnectingId(null);
          toast.error(payload.message || 'Plugin connection failed');
        }
      }),
    [connectingId, sessionId],
  );

  useEffect(() => {
    const clean = deferredQuery;

    if (!clean) {
      setSearchCatalogItems([]);
      setSemanticCatalogItems([]);
      setSemanticToolkitSlugs(new Set());
      setSemanticError(false);
      setSearchLoading(false);
      return;
    }

    const seq = ++requestSeq.current;
    const timer = window.setTimeout(() => {
      if (clean.length < 2 || composioConfigured !== true) return;

      setSearchLoading(true);
      setSemanticError(false);

      void Promise.allSettled([
        xrogaConnect.catalog({
          search: clean,
          sortBy: 'usage',
          limit: SEARCH_PAGE_SIZE,
        }),
        xrogaConnect.search(clean, sessionId ?? undefined),
      ]).then(async ([catalogResult, semanticResult]) => {
        if (requestSeq.current !== seq) return;

        if (catalogResult.status === 'fulfilled') {
          setSearchCatalogItems(catalogResult.value.items);
        } else {
          setSearchCatalogItems([]);
        }

        if (semanticResult.status === 'fulfilled') {
          setSessionId(semanticResult.value.sessionId);
          absorbConnections(semanticResult.value.toolkits ?? []);

          const slugs = [
            ...new Set([
              ...(semanticResult.value.toolkits ?? []).map((item) => item.toolkit),
              ...(semanticResult.value.tools ?? []).map((item) => item.toolkit),
            ]),
          ].slice(0, 10);

          setSemanticToolkitSlugs(
            new Set(slugs.map((slug) => slug.toLowerCase())),
          );

          const exactCatalogSlugs = new Set(
            catalogResult.status === 'fulfilled'
              ? catalogResult.value.items.map((item) => item.slug)
              : [],
          );

          const missing = slugs.filter((slug) => !exactCatalogSlugs.has(slug));

          if (missing.length) {
            const metadata = await Promise.allSettled(
              missing.map((slug) => xrogaConnect.catalogToolkit(slug)),
            );

            if (requestSeq.current === seq) {
              setSemanticCatalogItems(
                metadata
                  .filter(
                    (
                      item,
                    ): item is PromiseFulfilledResult<{
                      ok: boolean;
                      toolkit: XrogaConnectCatalogToolkit;
                    }> => item.status === 'fulfilled',
                  )
                  .map((item) => item.value.toolkit),
              );
            }
          } else {
            setSemanticCatalogItems([]);
          }
        } else {
          setSemanticError(true);
          setSemanticToolkitSlugs(new Set());
          setSemanticCatalogItems([]);
        }

        if (requestSeq.current === seq) setSearchLoading(false);
      });
    }, 320);

    return () => window.clearTimeout(timer);
  }, [deferredQuery, composioConfigured, sessionId]);

  const connectionFor = (toolkit: string | undefined) =>
    toolkit ? toolkitConnections[toolkit] : undefined;

  const nativePlugins = useMemo<RuntimePlugin[]>(() => {
    return PLUGIN_DEFINITIONS
      .filter((plugin) => plugin.source === 'native')
      .map((plugin) => {
        const native = nativeState[plugin.id as NativePluginId];
        const catalog = catalogItems.find(
          (item) => canonicalPluginId(item.slug) === plugin.id,
        );

        const enriched = catalog
          ? pluginFromCatalog(catalog)
          : ({
              ...plugin,
              connected: false,
            } as RuntimePlugin);

        return {
          ...enriched,
          ...plugin,
          toolkit: catalog?.slug,
          logo: catalog?.logo || enriched.logo,
          logoFallback: enriched.logoFallback,
          toolsCount: catalog?.toolsCount,
          triggersCount: catalog?.triggersCount,
          authSchemes: catalog?.authSchemes,
          managedAuthSchemes: catalog?.managedAuthSchemes,
          categories: catalog?.categories,
          version: catalog?.version,
          appUrl: catalog?.appUrl,
          connected: native.state === 'connected',
          connectionState: native.state,
          accountLabel: native.accountLabel,
          statusMessage: native.statusMessage,
        };
      });
  }, [catalogItems, nativeState]);

  const runtimeFromCatalog = (
    item: XrogaConnectCatalogToolkit,
  ): RuntimePlugin => {
    const connection = connectionFor(item.slug);
    const canonical = canonicalPluginId(item.slug);
    const overrideConnected =
      connectedOverrides[item.slug] || connectedOverrides[canonical];

    return pluginFromCatalog(item, {
      connected: Boolean(connection?.connected || overrideConnected),
      accountLabel: connection?.connected ? connection.statusMessage : undefined,
      statusMessage: connection?.statusMessage,
    });
  };

  const browsePlugins = useMemo(() => {
    const nativeIds = new Set(nativePlugins.map((plugin) => plugin.id));
    const dynamic = catalogItems
      .map(runtimeFromCatalog)
      .filter((plugin) => !nativeIds.has(plugin.id));

    return mergePlugins([...nativePlugins, ...dynamic]);
    // runtimeFromCatalog intentionally reads the latest connection map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogItems, nativePlugins, toolkitConnections, connectedOverrides]);

  const connectedLongTail = useMemo<RuntimePlugin[]>(() => {
    const existingToolkits = new Set(
      browsePlugins.map((plugin) => plugin.toolkit).filter(Boolean),
    );

    const nativeIds = new Set(nativePlugins.map((plugin) => plugin.id));

    return Object.values(toolkitConnections)
      .filter(
        (item) =>
          item.connected &&
          !existingToolkits.has(item.toolkit) &&
          !nativeIds.has(canonicalPluginId(item.toolkit)),
      )
      .map((item) => {
        const generic = genericPluginDefinition(item.toolkit);
        return {
          ...generic,
          name: item.name || generic.name,
          description:
            item.description ||
            'Connected to Xroga. Open the Plugin to inspect its live capabilities.',
          category: inferCategory(item.name || generic.name, item.description),
          toolkit: item.toolkit,
          logo: item.logo,
          connected: true,
          noAuth: item.noAuth,
          accountLabel: item.statusMessage,
          statusMessage: item.statusMessage,
        };
      });
  }, [browsePlugins, toolkitConnections, nativePlugins]);

  const allPlugins = useMemo(
    () => mergePlugins([...browsePlugins, ...connectedLongTail]),
    [browsePlugins, connectedLongTail],
  );

  const searchPlugins = useMemo(() => {
    const clean = deferredQuery.trim();
    if (!clean) return [];

    const nativeIds = new Set(nativePlugins.map((plugin) => plugin.id));
    const dynamicSearchPlugins = searchCatalogItems
      .map(runtimeFromCatalog)
      .filter((plugin) => !nativeIds.has(plugin.id));
    const dynamicSemanticPlugins = semanticCatalogItems
      .map(runtimeFromCatalog)
      .filter((plugin) => !nativeIds.has(plugin.id));

    const source =
      clean.length < 2
        ? allPlugins
        : mergePlugins([
            ...nativePlugins,
            ...dynamicSearchPlugins,
            ...dynamicSemanticPlugins,
          ]);

    const semantic = semanticToolkitSlugs;

    return source
      .map((plugin) => ({
        plugin,
        score: pluginSearchScore(plugin, clean, semantic),
      }))
      .filter(({ score, plugin }) => {
        if (score > 0) return true;

        const haystack = [
          plugin.name,
          plugin.description,
          plugin.category,
          ...(plugin.keywords ?? []),
        ]
          .join(' ')
          .toLowerCase();

        return haystack.includes(clean.toLowerCase());
      })
      .sort((a, b) => b.score - a.score || a.plugin.name.localeCompare(b.plugin.name))
      .map(({ plugin }) => plugin);
    // runtimeFromCatalog intentionally reads latest connection state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    deferredQuery,
    allPlugins,
    nativePlugins,
    searchCatalogItems,
    semanticCatalogItems,
    semanticToolkitSlugs,
    toolkitConnections,
    connectedOverrides,
  ]);

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

  const popularPlugins = useMemo(() => {
    const explicitlyPopular = new Set(
      PLUGIN_DEFINITIONS.filter((plugin) => plugin.popular).map((plugin) => plugin.id),
    );
    const curated = browsePlugins.filter((plugin) => explicitlyPopular.has(plugin.id));
    const rest = browsePlugins.filter((plugin) => !explicitlyPopular.has(plugin.id));
    return mergePlugins([...curated, ...rest]).slice(0, 6);
  }, [browsePlugins]);

  const explorePlugins = useMemo(() => {
    const popularKeys = new Set(
      popularPlugins.map((plugin) => plugin.toolkit || plugin.id),
    );

    return browsePlugins
      .filter((plugin) => !popularKeys.has(plugin.toolkit || plugin.id))
      .slice(0, 8);
  }, [browsePlugins, popularPlugins]);

  const developerPlugins = useMemo(
    () =>
      allPlugins.filter(
        (plugin) =>
          plugin.developer ||
          plugin.category === 'Engineering' ||
          plugin.category === 'Infrastructure' ||
          plugin.categories?.some((category) =>
            /developer|engineering|devops|cloud|infrastructure/i.test(category.name),
          ),
      ),
    [allPlugins],
  );

  async function loadDiscoverySection(section: DiscoverySection) {
    if (sectionLoading[section.id] || sectionCatalog[section.id]) return;

    setSectionLoading((current) => ({ ...current, [section.id]: true }));
    setSectionErrors((current) => {
      const next = { ...current };
      delete next[section.id];
      return next;
    });

    try {
      const collected: XrogaConnectCatalogToolkit[] = [];

      for (const group of section.groups) {
        let cursor: string | undefined;
        let pages = 0;

        do {
          const page = await xrogaConnect.catalog({
            group,
            sortBy: 'usage',
            limit: 250,
            cursor,
          });

          for (const item of page.items) {
            if (!collected.some((existing) => existing.slug === item.slug)) {
              collected.push(item);
            }
          }

          cursor = page.nextCursor;
          pages += 1;
        } while (cursor && pages < 20);
      }

      setSectionCatalog((current) => ({
        ...current,
        [section.id]: collected,
      }));
    } catch (error) {
      setSectionErrors((current) => ({
        ...current,
        [section.id]:
          error instanceof Error
            ? error.message
            : `Could not load ${section.title} apps.`,
      }));
    } finally {
      setSectionLoading((current) => ({
        ...current,
        [section.id]: false,
      }));
    }
  }

  function toggleDiscoverySection(section: DiscoverySection) {
    const isExpanded = expandedSections.has(section.id);

    setExpandedSections((current) => {
      const next = new Set(current);
      if (isExpanded) next.delete(section.id);
      else next.add(section.id);
      return next;
    });

    if (!isExpanded && !sectionCatalog[section.id]) {
      void loadDiscoverySection(section);
    }
  }

  function pluginsForSection(section: DiscoverySection): RuntimePlugin[] {
    const raw = sectionCatalog[section.id];
    const source = raw
      ? mergePlugins([
          ...nativePlugins,
          ...raw.map(runtimeFromCatalog),
          ...connectedLongTail,
        ])
      : allPlugins;

    return source.filter((plugin) => section.categories.includes(plugin.category));
  }

  async function connectNative(plugin: RuntimePlugin) {
    const id = plugin.id as NativePluginId;

    sessionStorage.setItem('xroga-plugin-return', detailHref(plugin));

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

    const toolkit = plugin.toolkit;
    if (!toolkit) {
      throw new Error(`${plugin.name} does not have a valid app identifier.`);
    }

    let activeSession = sessionId;
    if (!activeSession) {
      const created = await xrogaConnect.session();
      activeSession = created.sessionId;
      setSessionId(created.sessionId);
    }

    const current = await xrogaConnect.toolkits(activeSession, {
      toolkits: [toolkit],
    });
    const metadata = current.toolkits.find((item) => item.toolkit === toolkit);

    if (metadata?.connected || metadata?.noAuth) {
      absorbConnections(current.toolkits);
      setConnectedOverrides((state) => ({
        ...state,
        [toolkit]: true,
      }));
      toast.success(
        metadata.noAuth
          ? `${plugin.name} is ready to use`
          : `${plugin.name} is already connected`,
      );
      return;
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

      setConnectingId(toolkit);

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
        // Browser may have already closed the popup.
      }
      throw error;
    }
  }

  async function handleConnect(plugin: RuntimePlugin) {
    if (connectingId || plugin.noAuth) return;
    const connectionKey = plugin.toolkit || plugin.id;
    setConnectingId(connectionKey);

    try {
      if (plugin.source === 'native') await connectNative(plugin);
      else await connectComposio(plugin);
    } catch (error) {
      setConnectingId(null);
      toast.error(error instanceof Error ? error.message : `Could not connect ${plugin.name}`);
    }
  }

  const searchMode = view === 'discover' && deferredQuery.length > 0;

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-[28px]">
              Plugins
            </h1>
            {globalCatalogTotal !== null ? (
              <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                {globalCatalogTotal.toLocaleString()} available
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
            Browse Xroga Apps, connect the services you use, and let Xroga discover the exact actions needed at runtime.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setAddPluginMode('menu');
            setAddPluginOpen(true);
          }}
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
            const value = event.target.value;
            setQuery(value);
            if (view !== 'discover') setView('discover');
          }}
          placeholder="Search any app or describe what you want Xroga to do…"
          className="w-full rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] py-3.5 pl-11 pr-12 text-sm text-[var(--text-primary)] shadow-subtle outline-none transition focus:border-[var(--accent)] focus-visible:shadow-[var(--focus-ring)]"
        />
        {searchLoading ? (
          <Loader2
            className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--text-muted)]"
            aria-label="Searching Plugins"
          />
        ) : null}
      </div>

      {searchMode ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Search results</h2>
              </div>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {searchPlugins.length
                  ? `${searchPlugins.length} matching Plugins — exact brands first, then capability matches.`
                  : searchLoading
                    ? 'Searching Xroga Apps and real capabilities…'
                    : `No Plugin matched “${deferredQuery}”.`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-xs font-semibold text-[var(--accent)] hover:underline"
            >
              Clear search
            </button>
          </div>

          {semanticError ? (
            

      <div className="flex items-start gap-2 rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3">
              <Search className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
              <p className="text-xs leading-5 text-[var(--text-secondary)]">
                Capability search is temporarily unavailable. Brand/catalogue search is still working.
              </p>
            </div>
          ) : null}

          {searchPlugins.length ? (
            <PluginListGrid
              plugins={searchPlugins}
              connectingId={connectingId}
              onConnect={handleConnect}
            />
          ) : !searchLoading ? (
            <div className="rounded-token-lg border border-dashed border-[var(--border-subtle)] px-5 py-8 text-center">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                No Plugin found for “{deferredQuery}”
              </h3>
              <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[var(--text-secondary)]">
                Try an app name or describe the task differently. Xroga searches the full app catalogue and the live capability index.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((item) => (
                <div key={item} className="h-40 animate-pulse rounded-token-lg bg-[var(--surface-inset)]" />
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
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
                      Browse the live catalogue below and connect any supported app.
                    </p>
                  </div>
                )}
              </section>

              <section>
                <div className="mb-2 flex items-center gap-1.5">
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">Popular</h2>
                  <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
                </div>
                {catalogLoading && !popularPlugins.length ? (
                  <div className="grid gap-x-10 lg:grid-cols-2">
                    {[0, 1, 2, 3, 4, 5].map((item) => (
                      <div key={item} className="h-[72px] animate-pulse border-b border-[var(--border-subtle)] bg-[var(--surface-inset)]/40" />
                    ))}
                  </div>
                ) : (
                  <PluginListGrid
                    plugins={popularPlugins}
                    connectingId={connectingId}
                    onConnect={handleConnect}
                  />
                )}
              </section>

              {explorePlugins.length ? (
                <section>
                  <div className="mb-2 flex items-center gap-1.5">
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">Explore</h2>
                    <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
                  </div>
                  <PluginListGrid
                    plugins={explorePlugins}
                    connectingId={connectingId}
                    onConnect={handleConnect}
                  />
                </section>
              ) : null}

              <section>
                <div className="mb-5">
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                    Browse by category
                  </h2>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--text-secondary)]">
                    A few of the most useful apps are shown first. Open any category to reveal the full supported set, then close it again to return to the compact view.
                  </p>
                </div>

                <div className="space-y-7">
                  {DISCOVERY_SECTIONS.map((section) => (
                    <CategoryPluginSection
                      key={section.id}
                      section={section}
                      plugins={pluginsForSection(section)}
                      expanded={expandedSections.has(section.id)}
                      loading={Boolean(sectionLoading[section.id])}
                      error={sectionErrors[section.id]}
                      connectingId={connectingId}
                      onConnect={handleConnect}
                      onToggle={() => toggleDiscoverySection(section)}
                    />
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          {view === 'connected' ? (
            <section className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Connected Plugins</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Manage every active Xroga App connection and native developer service.
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
                  Developer, infrastructure, monitoring and data services available to Xroga. Publishing remains separate.
                </p>
              </div>

              {developerPlugins.length ? (
                <PluginGrid
                  plugins={developerPlugins}
                  connectingId={connectingId}
                  onConnect={handleConnect}
                />
              ) : (
                <p className="rounded-token-lg border border-dashed border-[var(--border-subtle)] p-4 text-sm text-[var(--text-secondary)]">
                  Load more catalogue pages or use search to find a specific developer service.
                </p>
              )}

              <div className="rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3 text-xs leading-5 text-[var(--text-secondary)]">
                Configure production targets, builds and shipping from{' '}
                <Link href="/dashboard/publish" className="font-semibold text-[var(--accent)] hover:underline">
                  Publish
                </Link>
                . Plugins manages providers, real capabilities and connections.
              </div>
            </section>
          ) : null}

          {view === 'custom' ? (
            <section id="custom-plugin-options" className="space-y-6 scroll-mt-8">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Custom Plugins</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                  Extend Xroga with your own remote MCP server, API credentials, or webhook without cluttering the main app directory.
                </p>
              </div>

              <CustomMcpManager />

              <details className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
                <summary className="cursor-pointer list-none p-4 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
                  <div className="flex items-center gap-3">
                    <KeyRound className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">API keys & webhooks</p>
                      <p className="mt-0.5 text-xs leading-5 text-[var(--text-secondary)]">
                        Open the encrypted credential vault only when you need a service outside the app directory.
                      </p>
                    </div>
                  </div>
                </summary>
                <div className="space-y-5 border-t border-[var(--border-subtle)] p-4">
                  <CustomCredentialsSection />
                </div>
              </details>

              <details className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
                <summary className="cursor-pointer list-none p-4 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
                  <div className="flex items-center gap-3">
                    <Sparkles className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Optional product credentials</p>
                      <p className="mt-0.5 text-xs leading-5 text-[var(--text-secondary)]">
                        Brevo, Cloudflare and other optional product-service credentials stay available without taking over the Plugins page.
                      </p>
                    </div>
                  </div>
                </summary>
                <div className="border-t border-[var(--border-subtle)] p-4">
                  <ConnectedServicesSection />
                </div>
              </details>
            </section>
          ) : null}
        </>
      )}

      <Dialog
        open={addPluginOpen}
        onClose={() => {
          setAddPluginMode('menu');
          setAddPluginOpen(false);
        }}
        title={addPluginMode === 'mcp' ? 'Add Custom MCP' : addPluginMode === 'credentials' ? 'Add credential' : 'Add Plugin'}
        description={
          addPluginMode === 'mcp'
            ? 'Turn a remote MCP server into a first-class Xroga Plugin.'
            : addPluginMode === 'credentials'
              ? 'Use the encrypted credential vault for services outside the app directory.'
              : globalCatalogTotal !== null
                ? `Connect from ${globalCatalogTotal.toLocaleString()} available Xroga Apps, add a remote MCP server, or bring your own credential.`
                : 'Connect an Xroga App, add a remote MCP server, or bring your own credential.'
        }
        className="max-w-[460px]"
      >
        {addPluginMode === 'mcp' ? (
          <CustomMcpCreateForm
            onBack={() => setAddPluginMode('menu')}
            onCreated={() => {
              setAddPluginMode('menu');
              setAddPluginOpen(false);
              setView('custom');
            }}
          />
        ) : addPluginMode === 'credentials' ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setAddPluginMode('menu')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <ChevronRight className="h-3.5 w-3.5 rotate-180" aria-hidden="true" />
              Back
            </button>
            <div className="rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3">
              <p className="text-xs font-semibold text-[var(--text-primary)]">Encrypted credential vault</p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                Add API keys or webhooks only for services that are not already available as Xroga Apps. Your existing vault and Vercel-sync behavior stay unchanged.
              </p>
            </div>
            <button
              type="button"
              onClick={openCredentials}
              className="inline-flex min-h-10 w-full items-center justify-center rounded-token-sm bg-[var(--accent)] px-4 text-sm font-semibold text-white"
            >
              Open credential vault
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={focusPluginSearch}
              className="flex w-full items-start gap-3 rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3 text-left transition hover:border-[var(--border-strong)]"
            >
              <Search className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
              <span>
                <strong className="block text-sm font-semibold text-[var(--text-primary)]">
                  Find an Xroga App
                </strong>
                <span className="mt-0.5 block text-xs leading-5 text-[var(--text-secondary)]">
                  Search by brand or describe a task. Xroga finds matching apps, real actions, triggers and task plans.
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setAddPluginMode('mcp')}
              className="flex w-full items-start gap-3 rounded-token-md border border-[var(--border-subtle)] p-3 text-left transition hover:border-[var(--border-strong)]"
            >
              <Server className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
              <span>
                <strong className="block text-sm font-semibold text-[var(--text-primary)]">
                  Custom MCP server
                </strong>
                <span className="mt-0.5 block text-xs leading-5 text-[var(--text-secondary)]">
                  Register a remote HTTPS MCP server, connect authentication when required, and sync its tools into Xroga.
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setAddPluginMode('credentials')}
              className="flex w-full items-start gap-3 rounded-token-md border border-[var(--border-subtle)] p-3 text-left transition hover:border-[var(--border-strong)]"
            >
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
              <span>
                <strong className="block text-sm font-semibold text-[var(--text-primary)]">
                  API key or webhook
                </strong>
                <span className="mt-0.5 block text-xs leading-5 text-[var(--text-secondary)]">
                  Use Xroga’s encrypted credential vault for services outside the app directory.
                </span>
              </span>
            </button>

            <div className="rounded-token-md border border-[var(--border-subtle)] px-3 py-2.5">
              <p className="text-xs leading-5 text-[var(--text-secondary)]">
                Xroga Apps expose their current actions and triggers at runtime, so the directory stays simple even when an app has hundreds of capabilities.
              </p>
            </div>
          </div>
        )}
      </Dialog>

      <div className="flex items-start gap-2 rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
        <p className="text-xs leading-5 text-[var(--text-secondary)]">
          Every available Xroga App can be discovered at runtime. Xroga still keeps read/write/destructive classification and explicit confirmation for consequential actions.
        </p>
      </div>
    </div>
  );
}