'use client';

import Link from 'next/link';
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Check,
  ChevronRight,
  ExternalLink,
  Loader2,
  Search,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { IntegrationLogo } from '@/components/integrations/IntegrationLogo';
import { ConnectedServicesSection } from '@/components/integrations/ConnectedServicesSection';
import { CustomCredentialsSection } from '@/components/integrations/CustomCredentialsSection';
import { api } from '@/lib/api';
import {
  clearOAuthResult,
  subscribeOAuthResults,
} from '@/lib/oauthPopupResult';
import {
  xrogaConnect,
  type XrogaConnectToolkit,
  type XrogaConnectTool,
} from '@/lib/xrogaConnect';

type PluginView =
  | 'discover'
  | 'connected'
  | 'developer'
  | 'custom';

type NativePluginId =
  | 'github'
  | 'vercel'
  | 'supabase';

type ConnectionState =
  | 'checking'
  | 'connected'
  | 'disconnected'
  | 'error';

type PluginSource =
  | 'native'
  | 'composio';

type PluginDefinition = {
  id: string;
  name: string;
  description: string;
  category: string;
  source: PluginSource;
  query?: string;
  popular?: boolean;
  developer?: boolean;
  keywords?: string[];
};

type RuntimePlugin = PluginDefinition & {
  toolkit?: string;
  logo?: string;
  connected: boolean;
  connectionState?: ConnectionState;
  capabilityCount?: number;
};

const CATEGORY_ORDER = [
  'All',
  'Productivity',
  'Communication',
  'Engineering',
  'Sales & CRM',
  'Commerce',
  'Marketing',
  'Finance',
  'Data & Analytics',
  'Infrastructure',
] as const;

const PLUGINS: PluginDefinition[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Search, read, draft and manage email.',
    category: 'Productivity',
    source: 'composio',
    popular: true,
    query: 'find Gmail email and message capabilities',
    keywords: ['email', 'mail', 'inbox', 'reply', 'attachments'],
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Find, create and manage calendar events.',
    category: 'Productivity',
    source: 'composio',
    popular: true,
    query: 'find Google Calendar event capabilities',
    keywords: ['calendar', 'schedule', 'meeting', 'events'],
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Find and work with files stored in Google Drive.',
    category: 'Productivity',
    source: 'composio',
    popular: true,
    query: 'find Google Drive file capabilities',
    keywords: ['files', 'documents', 'storage', 'upload'],
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Work with messages, channels and team conversations.',
    category: 'Communication',
    source: 'composio',
    popular: true,
    query: 'find Slack message and channel capabilities',
    keywords: ['messages', 'channels', 'team', 'chat'],
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Work with repositories, code, issues and pull requests.',
    category: 'Engineering',
    source: 'native',
    popular: true,
    developer: true,
    keywords: ['repository', 'code', 'issue', 'pull request', 'git'],
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Search and manage pages, databases and workspace content.',
    category: 'Productivity',
    source: 'composio',
    popular: true,
    query: 'find Notion page and database capabilities',
    keywords: ['pages', 'database', 'notes', 'documents'],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Work with customers, invoices, billing and payments.',
    category: 'Commerce',
    source: 'composio',
    popular: true,
    query: 'find Stripe payment invoice and customer capabilities',
    keywords: ['payments', 'invoice', 'billing', 'customer', 'subscription'],
  },
  {
    id: 'shopify',
    name: 'Shopify',
    description: 'Work with store orders, products and customers.',
    category: 'Commerce',
    source: 'composio',
    popular: true,
    query: 'find Shopify order product and store capabilities',
    keywords: ['orders', 'store', 'products', 'inventory', 'commerce'],
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'Work with contacts, companies, deals and CRM activity.',
    category: 'Sales & CRM',
    source: 'composio',
    popular: true,
    query: 'find HubSpot contact company and deal capabilities',
    keywords: ['crm', 'sales', 'contacts', 'deals', 'customers'],
  },
  {
    id: 'airtable',
    name: 'Airtable',
    description: 'Find, create and update records in Airtable bases.',
    category: 'Data & Analytics',
    source: 'composio',
    query: 'find Airtable record and base capabilities',
    keywords: ['records', 'database', 'table', 'data'],
  },
  {
    id: 'quickbooks',
    name: 'QuickBooks',
    description: 'Work with invoices, customers and accounting records.',
    category: 'Finance',
    source: 'composio',
    query: 'find QuickBooks invoice customer and accounting capabilities',
    keywords: ['invoice', 'accounting', 'customer', 'payment', 'finance'],
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Create, find and manage issues and projects.',
    category: 'Engineering',
    source: 'composio',
    popular: true,
    query: 'find Linear issue and project capabilities',
    keywords: ['issues', 'projects', 'engineering', 'tasks'],
  },
  {
    id: 'sentry',
    name: 'Sentry',
    description: 'Inspect errors, issues and application monitoring data.',
    category: 'Engineering',
    source: 'composio',
    query: 'find Sentry error issue and monitoring capabilities',
    keywords: ['errors', 'monitoring', 'issues', 'debugging'],
  },
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'Connect deployment infrastructure for web projects.',
    category: 'Infrastructure',
    source: 'native',
    developer: true,
    keywords: ['deploy', 'hosting', 'web', 'production'],
  },
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Connect database, authentication, storage and realtime.',
    category: 'Infrastructure',
    source: 'native',
    developer: true,
    keywords: ['database', 'auth', 'storage', 'backend', 'realtime'],
  },
];

const POPULAR_HYDRATION_QUERY =
  'find capabilities for Gmail, Google Calendar, Google Drive, Slack, Stripe, Shopify, HubSpot, Notion, Airtable, QuickBooks, Linear, and Sentry';

function canonicalPluginId(value: string): string {
  const compact = value.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (compact.includes('gmail')) return 'gmail';
  if (compact.includes('googlecalendar') || compact === 'gcal') return 'google-calendar';
  if (compact.includes('googledrive')) return 'google-drive';
  if (compact.includes('slack')) return 'slack';
  if (compact.includes('stripe')) return 'stripe';
  if (compact.includes('shopify')) return 'shopify';
  if (compact.includes('hubspot')) return 'hubspot';
  if (compact.includes('notion')) return 'notion';
  if (compact.includes('airtable')) return 'airtable';
  if (compact.includes('quickbooks')) return 'quickbooks';
  if (compact.includes('linear')) return 'linear';
  if (compact.includes('sentry')) return 'sentry';
  if (compact.includes('github')) return 'github';
  if (compact.includes('vercel')) return 'vercel';
  if (compact.includes('supabase')) return 'supabase';

  return compact || value.toLowerCase();
}

function displayToolkitName(toolkit: string): string {
  return toolkit
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function inferCategory(name: string, description = ''): string {
  const haystack = `${name} ${description}`.toLowerCase();

  if (/mail|calendar|drive|document|note/.test(haystack)) return 'Productivity';
  if (/slack|discord|message|chat|communication/.test(haystack)) return 'Communication';
  if (/github|gitlab|code|issue|monitor|sentry|developer/.test(haystack)) return 'Engineering';
  if (/crm|sales|lead|deal|hubspot/.test(haystack)) return 'Sales & CRM';
  if (/shop|payment|stripe|order|commerce/.test(haystack)) return 'Commerce';
  if (/account|invoice|finance|quickbooks|xero/.test(haystack)) return 'Finance';
  if (/analytics|data|table|airtable|database/.test(haystack)) return 'Data & Analytics';

  return 'Other';
}

function PluginMark({
  plugin,
}: {
  plugin: RuntimePlugin;
}) {
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

  return (
    <article className="group flex min-h-[142px] flex-col rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-subtle motion-reduce:transform-none">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <PluginMark plugin={plugin} />
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-[var(--text-primary)]">
              {plugin.name}
            </h3>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{plugin.category}</p>
          </div>
        </div>

        {plugin.connected ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)]">
            <Check className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
            Connected
          </span>
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

      <p className="mt-3 line-clamp-2 text-sm leading-5 text-[var(--text-secondary)]">
        {plugin.description}
      </p>

      <div className="mt-auto flex items-end justify-between gap-2 pt-3">
        <span className="text-[11px] text-[var(--text-muted)]">
          {plugin.capabilityCount
            ? `${plugin.capabilityCount} ${plugin.capabilityCount === 1 ? 'capability' : 'capabilities'}`
            : plugin.source === 'native'
              ? 'Xroga native'
              : 'Xroga Connect'}
        </span>

        {plugin.developer ? (
          <Link
            href="/dashboard/publish"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:underline"
          >
            Publish
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        ) : null}
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
  const [view, setView] = useState<PluginView>('discover');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim());
  const [category, setCategory] = useState('All');
  const [visibleCount, setVisibleCount] = useState(12);
  const [nativeState, setNativeState] = useState<Record<NativePluginId, ConnectionState>>({
    github: 'checking',
    vercel: 'checking',
    supabase: 'checking',
  });
  const [composioConfigured, setComposioConfigured] = useState<boolean | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [toolkitMap, setToolkitMap] = useState<Record<string, XrogaConnectToolkit>>({});
  const [semanticToolkits, setSemanticToolkits] = useState<XrogaConnectToolkit[]>([]);
  const [semanticTools, setSemanticTools] = useState<XrogaConnectTool[]>([]);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticError, setSemanticError] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectedOverrides, setConnectedOverrides] = useState<Record<string, boolean>>({});
  const requestSeq = useRef(0);

  const refreshNativeStatus = () => {
    setNativeState((current) => ({
      github: current.github === 'connected' ? 'connected' : 'checking',
      vercel: current.vercel === 'connected' ? 'connected' : 'checking',
      supabase: current.supabase === 'connected' ? 'connected' : 'checking',
    }));

    void Promise.allSettled([
      api.github.status(),
      api.vercel.status(),
      api.supabase.status(),
    ]).then((results) => {
      setNativeState({
        github:
          results[0].status === 'fulfilled'
            ? results[0].value.connected
              ? 'connected'
              : 'disconnected'
            : 'error',
        vercel:
          results[1].status === 'fulfilled'
            ? results[1].value.connected
              ? 'connected'
              : 'disconnected'
            : 'error',
        supabase:
          results[2].status === 'fulfilled'
            ? results[2].value.connected
              ? 'connected'
              : 'disconnected'
            : 'error',
      });
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

    const connected: Record<string, boolean> = {};
    for (const item of toolkits) {
      if (item.connected) {
        connected[canonicalPluginId(`${item.name ?? ''} ${item.toolkit}`)] = true;
      }
    }

    if (Object.keys(connected).length) {
      setConnectedOverrides((current) => ({ ...current, ...connected }));
    }

    if (tools.length) {
      setSemanticTools(tools);
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
        } catch {
          // Catalogue remains useful from curated local metadata.
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
      const url = new URL(window.location.href);
      ['github', 'vercel', 'supabase', 'composio', 'message', 'username', 'pick'].forEach((key) =>
        url.searchParams.delete(key),
      );
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, []);

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
          setSemanticTools(result.tools ?? []);
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
  }, [deferredQuery, composioConfigured]);

  const basePlugins = useMemo<RuntimePlugin[]>(() => {
    const toolCount = new Map<string, number>();

    for (const tool of semanticTools) {
      toolCount.set(tool.toolkit, (toolCount.get(tool.toolkit) ?? 0) + 1);
    }

    return PLUGINS.map((plugin) => {
      const toolkit = toolkitMap[plugin.id];
      const native = plugin.source === 'native' ? nativeState[plugin.id as NativePluginId] : undefined;

      return {
        ...plugin,
        toolkit: toolkit?.toolkit,
        logo: toolkit?.logo,
        connected:
          plugin.source === 'native'
            ? native === 'connected'
            : Boolean(connectedOverrides[plugin.id] || toolkit?.connected),
        connectionState: native,
        capabilityCount: toolkit ? toolCount.get(toolkit.toolkit) : undefined,
      };
    });
  }, [toolkitMap, semanticTools, nativeState, connectedOverrides]);

  const semanticPlugins = useMemo<RuntimePlugin[]>(() => {
    const baseIds = new Set(basePlugins.map((plugin) => plugin.id));
    const countByToolkit = new Map<string, number>();

    for (const tool of semanticTools) {
      countByToolkit.set(tool.toolkit, (countByToolkit.get(tool.toolkit) ?? 0) + 1);
    }

    return semanticToolkits
      .map((item) => {
        const name = item.name || displayToolkitName(item.toolkit);
        const id = canonicalPluginId(`${name} ${item.toolkit}`);

        return {
          id,
          name,
          description: item.description || item.statusMessage || 'Connect this app so Xroga can use its available capabilities.',
          category: inferCategory(name, item.description),
          source: 'composio' as const,
          toolkit: item.toolkit,
          logo: item.logo,
          connected: Boolean(item.connected || connectedOverrides[id]),
          capabilityCount: countByToolkit.get(item.toolkit),
        };
      })
      .filter((plugin) => !baseIds.has(plugin.id));
  }, [semanticToolkits, semanticTools, basePlugins, connectedOverrides]);

  const allPlugins = useMemo(
    () => [...basePlugins, ...semanticPlugins],
    [basePlugins, semanticPlugins],
  );

  const searchedPlugins = useMemo(() => {
    const clean = deferredQuery.toLowerCase();

    return allPlugins.filter((plugin) => {
      if (category !== 'All' && plugin.category !== category) return false;
      if (!clean) return true;

      const definition = PLUGINS.find((item) => item.id === plugin.id);
      const searchText = [
        plugin.name,
        plugin.description,
        plugin.category,
        ...(definition?.keywords ?? []),
      ]
        .join(' ')
        .toLowerCase();

      return searchText.includes(clean) || semanticPlugins.some((semantic) => semantic.id === plugin.id);
    });
  }, [allPlugins, category, deferredQuery, semanticPlugins]);

  const connectedPlugins = useMemo(
    () => allPlugins.filter((plugin) => plugin.connected),
    [allPlugins],
  );

  const popularPlugins = useMemo(
    () => basePlugins.filter((plugin) => plugin.popular).slice(0, 9),
    [basePlugins],
  );

  const developerPlugins = useMemo(
    () => basePlugins.filter((plugin) => plugin.developer),
    [basePlugins],
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
          (item) => canonicalPluginId(`${item.name ?? ''} ${item.toolkit}`) === plugin.id,
        ) ?? result.toolkits?.[0];

      if (exact?.connected) {
        setConnectedOverrides((current) => ({ ...current, [plugin.id]: true }));
        toast.success(`${plugin.name} is already connected`);
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
        // Ignore popup close failures.
      }
      throw error;
    }
  }

  async function handleConnect(plugin: RuntimePlugin) {
    if (connectingId) return;

    setConnectingId(plugin.id);

    try {
      if (plugin.source === 'native') {
        await connectNative(plugin);
      } else {
        await connectComposio(plugin);
      }
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
            Connect the tools Xroga can securely work with. Search by app or describe what you want Xroga to do.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setView('custom')}
          className="inline-flex min-h-10 items-center justify-center rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          + Add plugin
        </button>
      </header>

      <div className="relative">
        <label htmlFor="plugin-marketplace-search" className="sr-only">
          Search plugins
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
          placeholder="Search plugins or describe what you want Xroga to do…"
          className="w-full rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] py-3.5 pl-11 pr-12 text-sm text-[var(--text-primary)] shadow-subtle outline-none transition focus:border-[var(--accent)] focus-visible:shadow-[var(--focus-ring)]"
        />
        {semanticLoading ? (
          <Loader2
            className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--text-muted)]"
            aria-label="Searching plugins"
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
                  Browse below and connect the tools you use. GitHub is no longer required before other Plugins.
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
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Connected Plugins</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              A simple overview for Step 1. Full connection management comes in Step 2.
            </p>
          </div>
          {connectedPlugins.length ? (
            <PluginGrid
              plugins={connectedPlugins}
              connectingId={connectingId}
              onConnect={handleConnect}
            />
          ) : (
            <div className="rounded-token-lg border border-dashed border-[var(--border-subtle)] px-5 py-8">
              <p className="text-sm font-medium text-[var(--text-primary)]">No Plugins connected yet.</p>
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
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Developer Plugins</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Connect the infrastructure Xroga uses for code, hosting and backend services.
            </p>
          </div>
          <PluginGrid
            plugins={developerPlugins}
            connectingId={connectingId}
            onConnect={handleConnect}
          />
          <div className="rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3 text-xs leading-5 text-[var(--text-secondary)]">
            Publishing stays separate from Plugins. Configure shipping and production targets from{' '}
            <Link href="/dashboard/publish" className="font-semibold text-[var(--accent)] hover:underline">
              Publish
            </Link>
            .
          </div>
        </section>
      ) : null}

      {view === 'custom' ? (
        <section className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Custom Plugins</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
              Use the credential and service connections Xroga already supports. The guided MCP/custom Plugin builder arrives in Step 2.
            </p>
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
