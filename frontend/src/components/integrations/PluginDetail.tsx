'use client';

import Link from 'next/link';
import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { IntegrationLogo } from '@/components/integrations/IntegrationLogo';
import { api } from '@/lib/api';
import {
  canonicalPluginId,
  genericPluginDefinition,
  groupCapabilities,
  inferCategory,
  pluginDefinitionFor,
  type ConnectionState,
  type NativePluginId,
  type PluginCapability,
  type PluginDefinition,
  type PluginCapabilityGroup,
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
import { useAppStore } from '@/store/useAppStore';

type NativeSnapshot = {
  state: ConnectionState;
  accountLabel?: string;
  statusMessage?: string;
};

function riskLabel(capability: PluginCapability) {
  if (capability.requiresConfirmation) return 'Confirmation';
  if (capability.risk === 'destructive') return 'Sensitive';
  if (capability.risk === 'write') return 'Write';
  if (capability.risk === 'read') return 'Read';
  return 'Action';
}

function RiskBadge({ capability }: { capability: PluginCapability }) {
  const label = riskLabel(capability);
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
      {label}
    </span>
  );
}

function DetailLogo({
  definition,
  toolkit,
}: {
  definition: PluginDefinition;
  toolkit: XrogaConnectToolkit | null;
}) {
  const [failed, setFailed] = useState(false);

  if (toolkit?.logo && !failed) {
    return (
      <img
        src={toolkit.logo}
        alt=""
        className="h-14 w-14 rounded-2xl border border-[var(--border-subtle)] bg-white object-contain p-2"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-inset)]">
      <IntegrationLogo id={definition.id} name={definition.name} size={31} />
    </span>
  );
}

function CapabilityGroup({
  group,
  open,
  onToggle,
  query,
}: {
  group: PluginCapabilityGroup;
  open: boolean;
  onToggle: () => void;
  query: string;
}) {
  const clean = query.trim().toLowerCase();
  const visible = clean
    ? group.capabilities.filter((capability) =>
        [capability.name, capability.description, capability.rawToolSlug]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(clean),
      )
    : group.capabilities;

  if (!visible.length) return null;

  return (
    <div className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open || Boolean(clean)}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <span>
          <span className="block text-sm font-semibold text-[var(--text-primary)]">{group.name}</span>
          <span className="text-[11px] text-[var(--text-muted)]">
            {visible.length} {visible.length === 1 ? 'capability' : 'capabilities'}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${
            open || clean ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {open || clean ? (
        <div className="border-t border-[var(--border-subtle)]">
          {visible.map((capability) => (
            <div
              key={capability.id}
              className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)]">{capability.name}</p>
                {capability.description ? (
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                    {capability.description}
                  </p>
                ) : null}
                {capability.requiresConfirmation ? (
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    Xroga may require confirmation before this action runs.
                  </p>
                ) : null}
              </div>
              <RiskBadge capability={capability} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PluginDetail({ pluginId }: { pluginId: string }) {
  const router = useRouter();
  const setChatPrefill = useAppStore((state) => state.setChatPrefill);
  const initialDefinition = pluginDefinitionFor(pluginId) ?? genericPluginDefinition(pluginId);

  const [definition, setDefinition] = useState<PluginDefinition>(initialDefinition);
  const [toolkit, setToolkit] = useState<XrogaConnectToolkit | null>(null);
  const [tools, setTools] = useState<XrogaConnectTool[]>([]);
  const [native, setNative] = useState<NativeSnapshot | null>(
    initialDefinition.source === 'native' ? { state: 'checking' } : null,
  );
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loadingCapabilities, setLoadingCapabilities] = useState(
    initialDefinition.source === 'composio',
  );
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [capabilityQuery, setCapabilityQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(['search-read']));

  const connected =
    definition.source === 'native'
      ? native?.state === 'connected'
      : Boolean(toolkit?.connected || toolkit?.noAuth);
  const noAuth = Boolean(toolkit?.noAuth);

  async function loadNative() {
    const id = definition.id as NativePluginId;
    setNative({ state: 'checking' });

    try {
      if (id === 'github') {
        const status = await api.github.status();
        setNative({
          state: status.connected ? 'connected' : 'disconnected',
          accountLabel: status.connected && status.username ? `@${status.username}` : undefined,
          statusMessage: status.connected ? 'Authorized GitHub account' : undefined,
        });
        return;
      }

      if (id === 'vercel') {
        const status = await api.vercel.status();
        setNative({
          state: status.connected
            ? status.tokenValid === false
              ? 'needs_attention'
              : 'connected'
            : 'disconnected',
          accountLabel: status.username || undefined,
          statusMessage: status.warning || status.error,
        });
        return;
      }

      const status = await api.supabase.status();
      setNative({
        state: status.connected ? 'connected' : 'disconnected',
        statusMessage: status.message,
      });
    } catch (error) {
      setNative({
        state: 'error',
        statusMessage: error instanceof Error ? error.message : 'Status unavailable',
      });
    }
  }

  async function loadComposio() {
    setLoadingCapabilities(true);
    setCapabilityError(null);

    try {
      const availability = await xrogaConnect.status();
      setConfigured(availability.configured);

      if (!availability.configured) {
        setCapabilityError('Connected business apps are temporarily unavailable.');
        setLoadingCapabilities(false);
        return;
      }

      // Keep the read-mode session for connection state and OAuth linking.
      const result = await xrogaConnect.search(
        definition.query || `find ${definition.name} capabilities`,
        sessionId ?? undefined,
      );

      setSessionId(result.sessionId);

      const exact = (result.toolkits ?? []).find(
        (item) =>
          canonicalPluginId(`${item.name ?? ''} ${item.toolkit}`) ===
          canonicalPluginId(definition.id),
      );

      const fallback =
        !pluginDefinitionFor(pluginId) && (result.toolkits?.length ?? 0) === 1
          ? result.toolkits[0]
          : undefined;

      let selected = exact ?? fallback ?? null;

      if (!selected) {
        if (!pluginDefinitionFor(pluginId)) {
          setNotFound(true);
        }
        setToolkit(null);
        setTools([]);
        setLoadingCapabilities(false);
        return;
      }

      // The toolkit-list endpoint returns richer metadata (name/logo/no-auth)
      // than search statuses. Failure here does not block the detail experience.
      try {
        const metadata = await xrogaConnect.toolkits(result.sessionId, {
          toolkits: [selected.toolkit],
        });
        selected =
          metadata.toolkits.find((item) => item.toolkit === selected?.toolkit) ??
          selected;
      } catch {
        // Search metadata is sufficient as a fallback.
      }

      setNotFound(false);
      setToolkit(selected);

      if (!pluginDefinitionFor(pluginId)) {
        const generic = genericPluginDefinition(pluginId);
        setDefinition({
          ...generic,
          id: canonicalPluginId(`${selected.name ?? ''} ${selected.toolkit}`),
          name: selected.name || generic.name,
          description:
            selected.description ||
            selected.statusMessage ||
            'Connect this app so Xroga can use its supported capabilities.',
          longDescription:
            selected.description ||
            'Connect this app so Xroga can use its supported capabilities when you ask.',
          category: inferCategory(
            selected.name || generic.name,
            selected.description,
          ),
          query: `find ${selected.name || selected.toolkit} capabilities`,
        });
      }

      // Capability discovery is metadata-only. Action-mode search includes
      // write/destructive tools and their real risk labels, but executes nothing.
      try {
        const actionResult = await xrogaConnect.actionSearch(
          definition.query || `find ${definition.name} capabilities`,
        );
        setTools(
          (actionResult.tools ?? []).filter(
            (tool) => tool.toolkit === selected?.toolkit,
          ),
        );
      } catch {
        // Fall back to read-safe tools if action metadata is unavailable.
        setTools(
          (result.tools ?? []).filter(
            (tool) => tool.toolkit === selected?.toolkit,
          ),
        );
      }
    } catch (error) {
      setCapabilityError(
        error instanceof Error ? error.message : 'Capabilities are temporarily unavailable.',
      );
    } finally {
      setLoadingCapabilities(false);
    }
  }

  useEffect(() => {
    setDefinition(pluginDefinitionFor(pluginId) ?? genericPluginDefinition(pluginId));
    setNotFound(false);
  }, [pluginId]);

  useEffect(() => {
    if (definition.source === 'native') {
      void loadNative();
      return;
    }

    void loadComposio();
    // The definition id is the stable detail identity; loading it once per detail is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definition.id, definition.source]);

  useEffect(
    () =>
      subscribeOAuthResults((payload) => {
        if (payload.type === 'xroga-composio-connected') {
          setConnecting(false);
          toast.success(`${definition.name} connected`);
          void loadComposio();
        }

        if (payload.type === 'xroga-composio-error') {
          setConnecting(false);
          toast.error(payload.message || `Could not connect ${definition.name}`);
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [definition.id],
  );

  const capabilityGroups = useMemo(() => groupCapabilities(tools), [tools]);

  const filteredGroups = useMemo(() => {
    if (!capabilityQuery.trim()) return capabilityGroups;
    const clean = capabilityQuery.trim().toLowerCase();
    return capabilityGroups.filter((group) =>
      group.capabilities.some((capability) =>
        [capability.name, capability.description, capability.rawToolSlug]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(clean),
      ),
    );
  }, [capabilityGroups, capabilityQuery]);

  const riskSummary = useMemo(() => {
    const summary = {
      read: 0,
      write: 0,
      destructive: 0,
      unknown: 0,
      confirmation: 0,
    };

    for (const tool of tools) {
      summary[tool.risk ?? 'unknown'] += 1;
      if (tool.requiresConfirmation) summary.confirmation += 1;
    }

    return summary;
  }, [tools]);

  async function connectNative() {
    const id = definition.id as NativePluginId;
    sessionStorage.setItem('xroga-plugin-return', `/dashboard/integrations/${definition.id}`);

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

  async function connectComposio() {
    if (configured === false) {
      throw new Error('Connected business apps are temporarily unavailable.');
    }

    let currentSession = sessionId;
    let selectedToolkit = toolkit?.toolkit;

    if (!currentSession || !selectedToolkit) {
      const result = await xrogaConnect.search(
        definition.query || `find ${definition.name} capabilities`,
        currentSession ?? undefined,
      );
      currentSession = result.sessionId;
      setSessionId(result.sessionId);
      const selected =
        (result.toolkits ?? []).find(
          (item) =>
            canonicalPluginId(`${item.name ?? ''} ${item.toolkit}`) ===
            canonicalPluginId(definition.id),
        ) ?? result.toolkits?.[0];
      selectedToolkit = selected?.toolkit;
      if (selected) setToolkit(selected);
    }

    if (!currentSession || !selectedToolkit) {
      throw new Error(`${definition.name} is not currently available to connect.`);
    }

    clearOAuthResult();

    const popup = window.open(
      '',
      'xroga-connect-oauth',
      'width=600,height=760,resizable=yes,scrollbars=yes',
    );

    try {
      const result = await xrogaConnect.link(currentSession, selectedToolkit);
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
        // No action needed if the browser already closed the popup.
      }
      throw error;
    }
  }

  async function handleConnect() {
    if (connecting) return;
    setConnecting(true);

    try {
      if (definition.source === 'native') await connectNative();
      else await connectComposio();
    } catch (error) {
      setConnecting(false);
      toast.error(
        error instanceof Error ? error.message : `Could not connect ${definition.name}`,
      );
    }
  }

  async function handleDisconnect() {
    if (definition.source !== 'native' || disconnecting) return;

    setDisconnecting(true);
    try {
      if (definition.id === 'github') await api.github.disconnect();
      else if (definition.id === 'vercel') await api.vercel.disconnect();
      else await api.supabase.disconnect();

      toast.success(`${definition.name} disconnected`);
      setConfirmDisconnect(false);
      await loadNative();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : `Could not disconnect ${definition.name}`,
      );
    } finally {
      setDisconnecting(false);
    }
  }

  function handleExample(example: string) {
    setChatPrefill(example);
    router.push('/workspace');
  }

  function toggleGroup(id: string) {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <Link
          href="/dashboard/integrations"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Plugins
        </Link>
        <div className="mt-8 rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Plugin not found</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Xroga could not match this Plugin to the current supported catalogue.
          </p>
          <Link
            href="/dashboard/integrations"
            className="mt-5 inline-flex min-h-10 items-center rounded-token-sm bg-[var(--accent)] px-4 text-sm font-semibold text-white"
          >
            Browse Plugins
          </Link>
        </div>
      </div>
    );
  }

  const connectionLabel =
    definition.source === 'native'
      ? native?.accountLabel
      : toolkit?.statusMessage || (connected ? 'Connected account' : undefined);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Link
        href="/dashboard/integrations"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Plugins
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0 space-y-6">
          <section className="flex flex-col gap-5 rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <DetailLogo definition={definition} toolkit={toolkit} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                    {definition.name}
                  </h1>
                  <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
                    {definition.category}
                  </span>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                  {definition.longDescription || definition.description}
                </p>
                {tools.length ? (
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    {tools.length} {tools.length === 1 ? 'capability' : 'capabilities'} available
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {connected ? (
                <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)]">
                  <Check className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
                  {noAuth ? 'Ready to use' : 'Connected'}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleConnect()}
                  disabled={connecting || native?.state === 'checking'}
                  className="inline-flex min-h-10 items-center gap-2 rounded-token-sm bg-[var(--accent)] px-4 text-sm font-semibold text-white disabled:opacity-55"
                >
                  {connecting || native?.state === 'checking' ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  )}
                  {connecting ? 'Connecting…' : `Connect ${definition.name}`}
                </button>
              )}
            </div>
          </section>

          {definition.examples?.length ? (
            <section>
              <div className="mb-3">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Try it with Xroga</h2>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Send a useful starting request to the existing Workspace composer.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {definition.examples.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => handleExample(example)}
                    className="group flex min-h-12 items-center justify-between gap-3 rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3 text-left text-sm text-[var(--text-primary)] transition hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                  >
                    <span>{example}</span>
                    <ChevronDown
                      className="h-4 w-4 -rotate-90 text-[var(--text-muted)] transition group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Capabilities</h2>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Human-readable groups backed by the Plugin’s real supported actions.
                </p>
              </div>
              {tools.length > 8 ? (
                <div className="relative w-full sm:w-72">
                  <label htmlFor="plugin-capability-search" className="sr-only">
                    Search {definition.name} capabilities
                  </label>
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                    aria-hidden="true"
                  />
                  <input
                    id="plugin-capability-search"
                    value={capabilityQuery}
                    onChange={(event) => setCapabilityQuery(event.target.value)}
                    placeholder={`Search ${definition.name} capabilities…`}
                    className="w-full rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-raised)] py-2.5 pl-9 pr-3 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  />
                </div>
              ) : null}
            </div>

            {definition.source === 'native' ? (
              <div className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Used by Xroga for</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(definition.nativeCapabilities ?? definition.developerUsage ?? []).map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-3 py-1.5 text-xs text-[var(--text-secondary)]"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ) : loadingCapabilities ? (
              <div className="space-y-2" aria-label="Loading capabilities">
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="h-14 animate-pulse rounded-token-lg bg-[var(--surface-inset)]"
                  />
                ))}
              </div>
            ) : capabilityError ? (
              <div className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
                <div className="flex items-start gap-3">
                  <TriangleAlert className="mt-0.5 h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      Capabilities temporarily unavailable
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{capabilityError}</p>
                    <button
                      type="button"
                      onClick={() => void loadComposio()}
                      className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)]"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      Retry
                    </button>
                  </div>
                </div>
              </div>
            ) : filteredGroups.length ? (
              <div className="space-y-2">
                {filteredGroups.map((group) => (
                  <CapabilityGroup
                    key={group.id}
                    group={group}
                    open={openGroups.has(group.id)}
                    onToggle={() => toggleGroup(group.id)}
                    query={capabilityQuery}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-token-lg border border-dashed border-[var(--border-subtle)] p-5 text-sm text-[var(--text-secondary)]">
                {capabilityQuery
                  ? 'No capabilities match this search.'
                  : 'No capabilities are available right now.'}
              </div>
            )}
          </section>

          <section className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  Access & safety
                </h2>
                {definition.source === 'native' ? (
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                    Xroga uses the existing provider authorization and its current confirmation rules. Connecting this Plugin does not bypass action safety or approval requirements.
                  </p>
                ) : (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <p className="text-xs text-[var(--text-secondary)]">
                      Read actions: <strong className="text-[var(--text-primary)]">{riskSummary.read}</strong>
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Write actions: <strong className="text-[var(--text-primary)]">{riskSummary.write}</strong>
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Sensitive actions: <strong className="text-[var(--text-primary)]">{riskSummary.destructive}</strong>
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Confirmation flagged: <strong className="text-[var(--text-primary)]">{riskSummary.confirmation}</strong>
                    </p>
                  </div>
                )}
                <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">
                  Unknown actions are never presented as read-only. Provider authorization and Xroga’s server-side risk controls remain authoritative.
                </p>
              </div>
            </div>
          </section>

          {tools.length ? (
            <details className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">
                Advanced · all raw actions
              </summary>
              <div className="max-h-80 overflow-y-auto border-t border-[var(--border-subtle)]">
                {tools.map((tool) => (
                  <div
                    key={tool.slug}
                    className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-2.5 last:border-b-0"
                  >
                    <code className="break-all text-[11px] text-[var(--text-secondary)]">{tool.slug}</code>
                    <span className="shrink-0 text-[10px] font-semibold text-[var(--text-muted)]">
                      {tool.requiresConfirmation
                        ? 'Confirmation'
                        : tool.risk === 'destructive'
                          ? 'Sensitive'
                          : tool.risk || 'Unknown'}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          <section className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Permissions</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              {definition.source === 'native'
                ? 'Exact access is controlled by the provider authorization Xroga already uses for this service.'
                : 'The provider authorization screen controls the exact OAuth permissions. Xroga uses only supported capabilities exposed by the connected Plugin.'}
            </p>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Raw OAuth scopes are not displayed unless the current provider API returns them.
            </p>
          </section>
        </main>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <section className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Connection</h2>

            <div className="mt-3">
              {definition.source === 'native' && native?.state === 'checking' ? (
                <p className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Checking connection…
                </p>
              ) : connected ? (
                <>
                  <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
                    <Check className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                    {noAuth ? 'Ready to use' : 'Connected'}
                  </p>
                  {connectionLabel ? (
                    <p className="mt-1 break-words text-xs text-[var(--text-secondary)]">
                      {connectionLabel}
                    </p>
                  ) : null}
                  {native?.statusMessage && native.statusMessage !== connectionLabel ? (
                    <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
                      {native.statusMessage}
                    </p>
                  ) : null}
                </>
              ) : native?.state === 'needs_attention' ? (
                <>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Reconnect required</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                    {native.statusMessage || 'Authorization needs attention.'}
                  </p>
                </>
              ) : native?.state === 'error' ? (
                <>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Status unavailable</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                    {native.statusMessage || 'Xroga could not check this connection.'}
                  </p>
                </>
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">Not connected</p>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {!noAuth ? (
                <button
                  type="button"
                  onClick={() => void handleConnect()}
                  disabled={connecting || native?.state === 'checking'}
                  className="inline-flex min-h-9 items-center gap-2 rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent)]/60 disabled:opacity-55"
                >
                  {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                  {connected ? 'Reconnect' : 'Connect'}
                </button>
              ) : null}

              {connected && definition.source === 'native' ? (
                <button
                  type="button"
                  onClick={() => setConfirmDisconnect(true)}
                  className="inline-flex min-h-9 items-center rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-secondary)] hover:border-red-400/50 hover:text-red-400"
                >
                  Disconnect
                </button>
              ) : null}
            </div>

            {connected && definition.source === 'composio' && !noAuth ? (
              <p className="mt-3 text-[11px] leading-5 text-[var(--text-muted)]">
                Xroga Connect currently exposes reconnect/authorization but not a generic unlink operation, so this screen does not fake a Disconnect action.
              </p>
            ) : null}
          </section>

          {definition.developer ? (
            <section className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Developer use</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {(definition.developerUsage ?? []).map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]"
                  >
                    {item}
                  </span>
                ))}
              </div>
              <Link
                href={
                  definition.id === 'vercel' || definition.id === 'supabase'
                    ? '/dashboard/publish?target=web'
                    : definition.id === 'expo'
                      ? '/dashboard/publish?target=mobile'
                      : '/dashboard/publish'
                }
                className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline"
              >
                Open Publish
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </section>
          ) : null}

          <section className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">About</h2>
            <dl className="mt-3 space-y-3 text-xs">
              <div>
                <dt className="text-[var(--text-muted)]">Provider</dt>
                <dd className="mt-0.5 font-medium text-[var(--text-primary)]">
                  {definition.provider || definition.name}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">Category</dt>
                <dd className="mt-0.5 font-medium text-[var(--text-primary)]">{definition.category}</dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">Connection</dt>
                <dd className="mt-0.5 font-medium text-[var(--text-primary)]">
                  {definition.source === 'native' ? 'Xroga native OAuth' : noAuth ? 'No authorization required' : 'OAuth / Xroga Connect'}
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>

      {confirmDisconnect ? (
        <div
          className="fixed inset-0 z-[500] flex items-center justify-center bg-black/55 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setConfirmDisconnect(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="plugin-disconnect-title"
            className="w-full max-w-sm rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 shadow-2xl"
          >
            <h2 id="plugin-disconnect-title" className="text-base font-semibold text-[var(--text-primary)]">
              Disconnect {definition.name}?
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Xroga will no longer use this connection. Existing Xroga projects are not deleted.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDisconnect(false)}
                className="min-h-10 rounded-token-sm border border-[var(--border-subtle)] px-4 text-sm font-semibold text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDisconnect()}
                disabled={disconnecting}
                className="inline-flex min-h-10 items-center gap-2 rounded-token-sm bg-red-500 px-4 text-sm font-semibold text-white disabled:opacity-55"
              >
                {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Disconnect
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}