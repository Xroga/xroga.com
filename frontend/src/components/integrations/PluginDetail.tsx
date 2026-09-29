'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { PluginBrandLogo } from '@/components/integrations/PluginBrandLogo';
import { PluginPermissionControl } from '@/components/integrations/PluginPermissionControl';
import { api } from '@/lib/api';
import {
  canonicalPluginId,
  genericPluginDefinition,
  groundedUseCasePrompt,
  groupCapabilities,
  pluginDefinitionFor,
  pluginFromCatalog,
  prettyToolName,
  type ConnectionState,
  type NativePluginId,
  type PluginCapability,
  type PluginCapabilityGroup,
  type PluginDefinition,
} from '@/lib/pluginCatalog';
import {
  clearOAuthResult,
  subscribeOAuthResults,
} from '@/lib/oauthPopupResult';
import {
  xrogaConnect,
  type XrogaConnectCatalogToolkit,
  type XrogaConnectSearchResult,
  type XrogaConnectSkill,
  type XrogaConnectToolkit,
  type XrogaConnectTool,
  type XrogaConnectToolDetails,
  type XrogaConnectTriggerType,
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
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
      {riskLabel(capability)}
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
            {visible.length.toLocaleString()} {visible.length === 1 ? 'action' : 'actions'}
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

function RawActionRow({
  tool,
}: {
  tool: XrogaConnectTool;
}) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<XrogaConnectToolDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);

    if (!next || details || loading) return;

    setLoading(true);
    setError(null);

    try {
      const result = await xrogaConnect.toolDetails(tool.slug);
      setDetails(result.tool);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not load full action metadata.',
      );
    } finally {
      setLoading(false);
    }
  }

  const risk =
    tool.requiresConfirmation
      ? 'Confirmation'
      : tool.risk === 'destructive'
        ? 'Sensitive'
        : tool.risk || 'Unknown';

  return (
    <div className="border-b border-[var(--border-subtle)] last:border-b-0">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--text-primary)]">
            {tool.name || prettyToolName(tool)}
          </p>
          <code className="mt-0.5 block break-all text-[10px] text-[var(--text-muted)]">
            {tool.slug}
          </code>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[10px] font-semibold text-[var(--text-muted)]">
            {risk}
          </span>
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text-muted)]" aria-hidden="true" />
          ) : (
            <ChevronDown
              className={`h-3.5 w-3.5 text-[var(--text-muted)] transition-transform ${
                open ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          )}
        </div>
      </button>

      {open ? (
        <div className="border-t border-[var(--border-subtle)] bg-[var(--surface-inset)]/45 px-4 py-4">
          {error ? (
            <p className="text-xs text-amber-600">{error}</p>
          ) : details ? (
            <div className="space-y-4">
              {details.humanDescription || details.description ? (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Description
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                    {details.humanDescription || details.description}
                  </p>
                </div>
              ) : null}

              <div className="grid gap-3 text-xs sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Version
                  </p>
                  <p className="mt-1 text-[var(--text-primary)]">{details.version || 'Current'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Authorization
                  </p>
                  <p className="mt-1 text-[var(--text-primary)]">
                    {details.noAuth ? 'No auth' : 'Connected provider account'}
                  </p>
                </div>
              </div>

              {details.scopes.length ? (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Scopes
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {details.scopes.map((scope) => (
                      <code
                        key={scope}
                        className="rounded bg-[var(--surface-raised)] px-2 py-1 text-[10px] text-[var(--text-secondary)]"
                      >
                        {scope}
                      </code>
                    ))}
                  </div>
                </div>
              ) : null}

              {details.inputSchema ? (
                <details className="rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
                  <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold text-[var(--text-primary)]">
                    Input schema
                  </summary>
                  <pre className="max-h-72 overflow-auto border-t border-[var(--border-subtle)] p-3 text-[10px] leading-4 text-[var(--text-secondary)]">
                    {JSON.stringify(details.inputSchema, null, 2)}
                  </pre>
                </details>
              ) : null}

              {details.outputSchema ? (
                <details className="rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
                  <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold text-[var(--text-primary)]">
                    Output schema
                  </summary>
                  <pre className="max-h-72 overflow-auto border-t border-[var(--border-subtle)] p-3 text-[10px] leading-4 text-[var(--text-secondary)]">
                    {JSON.stringify(details.outputSchema, null, 2)}
                  </pre>
                </details>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-secondary)]">Loading full action metadata…</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

async function fetchAllTools(toolkit: string): Promise<{
  items: XrogaConnectTool[];
  total: number;
}> {
  const items: XrogaConnectTool[] = [];
  let cursor: string | undefined;
  let total = 0;
  let pages = 0;

  do {
    const page = await xrogaConnect.catalogTools(toolkit, {
      limit: 100,
      cursor,
    });
    items.push(...page.items);
    total = page.totalItems;
    cursor = page.nextCursor;
    pages += 1;
  } while (cursor && pages < 50);

  return {
    items,
    total: Math.max(total, items.length),
  };
}

async function fetchAllTriggers(toolkit: string): Promise<{
  items: XrogaConnectTriggerType[];
  total: number;
}> {
  const items: XrogaConnectTriggerType[] = [];
  let cursor: string | undefined;
  let total = 0;
  let pages = 0;

  do {
    const page = await xrogaConnect.catalogTriggers(toolkit, {
      limit: 50,
      cursor,
    });
    items.push(...page.items);
    total = page.totalItems;
    cursor = page.nextCursor;
    pages += 1;
  } while (cursor && pages < 20);

  return {
    items,
    total: Math.max(total, items.length),
  };
}

export function PluginDetail({ pluginId }: { pluginId: string }) {
  const router = useRouter();
  const setChatPrefill = useAppStore((state) => state.setChatPrefill);
  const initialDefinition = pluginDefinitionFor(pluginId) ?? genericPluginDefinition(pluginId);

  const [definition, setDefinition] = useState<PluginDefinition>(initialDefinition);
  const [catalog, setCatalog] = useState<XrogaConnectCatalogToolkit | null>(null);
  const [connectionToolkit, setConnectionToolkit] = useState<XrogaConnectToolkit | null>(null);
  const [tools, setTools] = useState<XrogaConnectTool[]>([]);
  const [toolsTotal, setToolsTotal] = useState(0);
  const [triggers, setTriggers] = useState<XrogaConnectTriggerType[]>([]);
  const [triggersTotal, setTriggersTotal] = useState(0);
  const [native, setNative] = useState<NativeSnapshot | null>(
    initialDefinition.source === 'native' ? { state: 'checking' } : null,
  );
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loadingCapabilities, setLoadingCapabilities] = useState(true);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectingComposio, setConnectingComposio] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [capabilityQuery, setCapabilityQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(['search-read']));
  const [useCaseQuery, setUseCaseQuery] = useState('');
  const [useCaseLoading, setUseCaseLoading] = useState(false);
  const [useCaseError, setUseCaseError] = useState<string | null>(null);
  const [skill, setSkill] = useState<XrogaConnectSkill | null>(null);
  const [skillTools, setSkillTools] = useState<XrogaConnectTool[]>([]);
  const [guidance, setGuidance] = useState<string | null>(null);

  const nativeConnected = definition.source === 'native' && native?.state === 'connected';
  const composioConnected = Boolean(connectionToolkit?.connected || connectionToolkit?.noAuth);
  const connected = definition.source === 'native' ? nativeConnected : composioConnected;
  const noAuth = Boolean(connectionToolkit?.noAuth || catalog?.noAuth);

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

  async function resolveCatalogToolkit(): Promise<XrogaConnectCatalogToolkit | null> {
    try {
      return (await xrogaConnect.catalogToolkit(pluginId)).toolkit;
    } catch {
      const known = pluginDefinitionFor(pluginId);
      if (!known) return null;

      try {
        const page = await xrogaConnect.catalog({
          search: known.name,
          sortBy: 'usage',
          limit: 20,
        });

        return (
          page.items.find(
            (item) =>
              canonicalPluginId(item.slug) === canonicalPluginId(known.id) ||
              item.name.toLowerCase() === known.name.toLowerCase(),
          ) ?? null
        );
      } catch {
        return null;
      }
    }
  }

  async function loadPlugin() {
    setLoadingCapabilities(true);
    setCapabilityError(null);

    try {
      const availability = await xrogaConnect.status();
      setConfigured(availability.configured);

      if (definition.source === 'native') {
        await loadNative();
      }

      if (!availability.configured) {
        if (definition.source !== 'native') {
          setCapabilityError('Xroga Connect is not configured in this environment.');
        }
        setLoadingCapabilities(false);
        return;
      }

      const metadata = await resolveCatalogToolkit();

      if (!metadata) {
        if (!pluginDefinitionFor(pluginId)) setNotFound(true);
        setLoadingCapabilities(false);
        return;
      }

      setNotFound(false);
      setCatalog(metadata);

      const runtime = pluginFromCatalog(metadata);
      setDefinition((current) => ({
        ...current,
        ...runtime,
        source: current.source === 'native' ? 'native' : 'composio',
      }));

      let activeSession = sessionId;
      if (!activeSession) {
        const created = await xrogaConnect.session();
        activeSession = created.sessionId;
        setSessionId(created.sessionId);
      }

      const [connectionResult, toolResult, triggerResult] = await Promise.allSettled([
        xrogaConnect.toolkits(activeSession, {
          toolkits: [metadata.slug],
        }),
        fetchAllTools(metadata.slug),
        metadata.triggersCount > 0
          ? fetchAllTriggers(metadata.slug)
          : Promise.resolve({ items: [], total: 0 }),
      ]);

      if (connectionResult.status === 'fulfilled') {
        setConnectionToolkit(
          connectionResult.value.toolkits.find((item) => item.toolkit === metadata.slug) ?? null,
        );
      }

      if (toolResult.status === 'fulfilled') {
        setTools(toolResult.value.items);
        setToolsTotal(toolResult.value.total);
      } else {
        setTools([]);
        setToolsTotal(metadata.toolsCount);
        setCapabilityError('The action catalogue is temporarily unavailable.');
      }

      if (triggerResult.status === 'fulfilled') {
        setTriggers(triggerResult.value.items);
        setTriggersTotal(triggerResult.value.total);
      } else {
        setTriggers([]);
        setTriggersTotal(metadata.triggersCount);
      }
    } catch (error) {
      setCapabilityError(
        error instanceof Error ? error.message : 'Plugin metadata is temporarily unavailable.',
      );
    } finally {
      setLoadingCapabilities(false);
    }
  }

  useEffect(() => {
    setDefinition(pluginDefinitionFor(pluginId) ?? genericPluginDefinition(pluginId));
    setCatalog(null);
    setConnectionToolkit(null);
    setTools([]);
    setTriggers([]);
    setSkill(null);
    setSkillTools([]);
    setGuidance(null);
    setNotFound(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pluginId]);

  useEffect(() => {
    void loadPlugin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pluginId]);

  useEffect(
    () =>
      subscribeOAuthResults((payload) => {
        if (payload.type === 'xroga-composio-connected') {
          setConnecting(false);
          setConnectingComposio(false);
          toast.success(`${definition.name} connected`);
          void loadPlugin();
        }

        if (payload.type === 'xroga-composio-error') {
          setConnecting(false);
          setConnectingComposio(false);
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

  const scopes = useMemo(
    () =>
      [...new Set(tools.flatMap((tool) => tool.scopes ?? []).filter(Boolean))].sort(),
    [tools],
  );

  const actionUseCases = useMemo(() => {
    if (definition.examples?.length) {
      return definition.examples.map((prompt) => ({
        label: prompt,
        prompt,
      }));
    }

    const candidates = [
      ...tools.filter((tool) => tool.important),
      ...tools.filter((tool) => !tool.important),
    ];

    const seen = new Set<string>();
    return candidates
      .filter((tool) => {
        if (seen.has(tool.slug)) return false;
        seen.add(tool.slug);
        return true;
      })
      .slice(0, 4)
      .map((tool) => {
        const action = tool.name || prettyToolName(tool);
        const prompt = groundedUseCasePrompt(tool, definition.name);
        const prefix = `Use ${definition.name} to `;
        const groundedLabel = prompt.startsWith(prefix)
          ? prompt
              .slice(prefix.length)
              .replace(/^./, (value) => value.toUpperCase())
          : action;

        return {
          label: groundedLabel,
          prompt,
        };
      });
  }, [definition.examples, definition.name, tools]);

  async function connectNative() {
    const id = definition.id as NativePluginId;
    sessionStorage.setItem('xroga-plugin-return', `/dashboard/integrations/${pluginId}`);

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
      throw new Error('Xroga Connect is temporarily unavailable.');
    }

    const toolkitSlug = catalog?.slug || connectionToolkit?.toolkit;
    if (!toolkitSlug) {
      throw new Error(`${definition.name} does not have a current app connection identifier.`);
    }

    let activeSession = sessionId;
    if (!activeSession) {
      const created = await xrogaConnect.session();
      activeSession = created.sessionId;
      setSessionId(created.sessionId);
    }

    const current = await xrogaConnect.toolkits(activeSession, {
      toolkits: [toolkitSlug],
    });
    const currentToolkit = current.toolkits.find((item) => item.toolkit === toolkitSlug);

    if (currentToolkit?.connected || currentToolkit?.noAuth) {
      setConnectionToolkit(currentToolkit);
      toast.success(
        currentToolkit.noAuth
          ? `${definition.name} is ready to use`
          : `${definition.name} is already connected`,
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
      const result = await xrogaConnect.link(activeSession, toolkitSlug);
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
        // Browser may have already closed the popup.
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

  async function handleConnectComposio() {
    if (connectingComposio) return;
    setConnectingComposio(true);

    try {
      await connectComposio();
    } catch (error) {
      setConnectingComposio(false);
      toast.error(
        error instanceof Error ? error.message : `Could not connect ${definition.name} AI actions`,
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

  function handleExample(prompt: string) {
    setChatPrefill(prompt);
    router.push('/workspace');
  }

  async function exploreUseCase() {
    const clean = useCaseQuery.trim();
    if (clean.length < 2) {
      toast.error('Describe what you want Xroga to do');
      return;
    }

    setUseCaseLoading(true);
    setUseCaseError(null);

    try {
      const result: XrogaConnectSearchResult = await xrogaConnect.actionSearch(
        `${definition.name}: ${clean}`,
      );
      const toolkitSlug = catalog?.slug;
      const matchedTools = toolkitSlug
        ? result.tools.filter((tool) => tool.toolkit === toolkitSlug)
        : result.tools;
      const matchedToolkit =
        !toolkitSlug ||
        matchedTools.length > 0 ||
        result.toolkits.some((item) => item.toolkit === toolkitSlug) ||
        Boolean(
          result.skill?.primaryToolSlugs.some((slug) =>
            slug.toLowerCase().startsWith(`${toolkitSlug.toLowerCase()}_`),
          ),
        ) ||
        Boolean(
          result.skill?.relatedToolSlugs.some((slug) =>
            slug.toLowerCase().startsWith(`${toolkitSlug.toLowerCase()}_`),
          ),
        );

      if (!matchedToolkit) {
        setSkill(null);
        setSkillTools([]);
        setGuidance(null);
        setUseCaseError(
          `No matching ${definition.name} workflow was found for this task. Try describing the task with more ${definition.name}-specific detail.`,
        );
      } else {
        setSkill(result.skill ?? null);
        setGuidance(result.guidance ?? null);
        setSkillTools(matchedTools);
      }
    } catch (error) {
      setSkill(null);
      setSkillTools([]);
      setGuidance(null);
      setUseCaseError(
        error instanceof Error ? error.message : 'Could not analyze this use case.',
      );
    } finally {
      setUseCaseLoading(false);
    }
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
          className="xv-plugin-back-button inline-flex items-center gap-2 text-sm font-semibold"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Plugins
        </Link>
        <div className="mt-8 rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Plugin not found</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Xroga could not match this route to the current Xroga Apps catalogue.
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
      : connectionToolkit?.statusMessage || (composioConnected ? 'Connected account' : undefined);

  const permissionToolkit =
    catalog?.slug ||
    connectionToolkit?.toolkit ||
    definition.id ||
    pluginId;

  const authorizationLabel =
    definition.source === 'native'
      ? 'OAuth'
      : noAuth
        ? 'No authorization required'
        : catalog?.managedAuthSchemes.length
          ? catalog.managedAuthSchemes.some((scheme) => /oauth/i.test(scheme))
            ? 'OAuth'
            : catalog.managedAuthSchemes.join(', ')
          : catalog?.authSchemes.length
            ? catalog.authSchemes.join(', ')
            : 'Provider authorization';

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Link
        href="/dashboard/integrations"
        className="xv-plugin-back-button inline-flex items-center gap-2 text-sm font-semibold"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Plugins
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0 space-y-6">
          <section className="flex flex-col gap-5 rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <PluginBrandLogo
                id={definition.id}
                name={definition.name}
                toolkit={catalog?.slug}
                logo={catalog?.logo}
                size="detail"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                    {definition.name}
                  </h1>
                  <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
                    {definition.category}
                  </span>
                  {catalog?.managedAuthSchemes.some((item) => /oauth/i.test(item)) ? (
                    <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                      Managed OAuth
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                  {definition.longDescription || definition.description}
                </p>
                <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-[var(--text-muted)]">
                  {catalog ? (
                    <>
                      <span>{catalog.toolsCount.toLocaleString()} actions</span>
                      <span>{catalog.triggersCount.toLocaleString()} triggers</span>
                      {catalog.version ? <span>Version {catalog.version}</span> : null}
                    </>
                  ) : toolsTotal ? (
                    <span>{toolsTotal.toLocaleString()} actions</span>
                  ) : null}
                </div>
              </div>
            </div>

            {definition.source !== 'native' ? (
              <button
                type="button"
                onClick={() => void handleConnect()}
                disabled={connecting || connected || noAuth}
                className="xv-plugin-connect-button inline-flex min-h-10 shrink-0 items-center justify-center gap-2 px-4 text-sm font-semibold disabled:cursor-default disabled:opacity-60"
              >
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {noAuth ? 'Ready' : connected ? 'Connected' : 'Connect'}
              </button>
            ) : null}
          </section>

          <section className="xv-plugin-task-planner rounded-[20px] border border-[var(--border-subtle)] p-5">
            <div className="min-w-0">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  Skills & task planning
                </h2>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                  Describe a task. Xroga searches the live action network for matching tools and, when a learned skill exists, shows its recommended plan and pitfalls.
                </p>

                <div className="xv-plugin-task-input mt-4 flex items-center gap-2">
                  <input
                    value={useCaseQuery}
                    onChange={(event) => setUseCaseQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void exploreUseCase();
                    }}
                    placeholder={`What do you want to do with ${definition.name}?`}
                    className="xv-plugin-task-input-field min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                  />
                  <button
                    type="button"
                    disabled={useCaseLoading}
                    onClick={() => void exploreUseCase()}
                    className="xv-plugin-task-submit inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
                  >
                    {useCaseLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Zap className="h-4 w-4" aria-hidden="true" />}
                    <span className="sr-only">Analyze task</span>
                  </button>
                </div>

                {useCaseError ? (
                  <p className="mt-3 text-xs text-amber-600">{useCaseError}</p>
                ) : null}

                {skill || skillTools.length || guidance ? (
                  <div className="mt-4 space-y-4 border-t border-[var(--border-subtle)] pt-4">
                    {skill?.difficulty ? (
                      <p className="text-xs text-[var(--text-secondary)]">
                        Difficulty: <strong className="text-[var(--text-primary)]">{skill.difficulty}</strong>
                      </p>
                    ) : null}

                    {skill?.recommendedPlanSteps.length ? (
                      <div>
                        <p className="text-xs font-semibold text-[var(--text-primary)]">Recommended plan</p>
                        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs leading-5 text-[var(--text-secondary)]">
                          {skill.recommendedPlanSteps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                      </div>
                    ) : guidance ? (
                      <div>
                        <p className="text-xs font-semibold text-[var(--text-primary)]">Execution guidance</p>
                        <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[var(--text-secondary)]">
                          {guidance}
                        </p>
                      </div>
                    ) : null}

                    {skill?.knownPitfalls.length ? (
                      <div>
                        <p className="text-xs font-semibold text-[var(--text-primary)]">Known pitfalls</p>
                        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-5 text-[var(--text-secondary)]">
                          {skill.knownPitfalls.map((pitfall) => (
                            <li key={pitfall}>{pitfall}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {skillTools.length ? (
                      <div>
                        <p className="text-xs font-semibold text-[var(--text-primary)]">Matched actions</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {skillTools.slice(0, 8).map((tool) => (
                            <span
                              key={tool.slug}
                              className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-2.5 py-1 text-[10px] font-medium text-[var(--text-secondary)]"
                            >
                              {tool.name || prettyToolName(tool)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => handleExample(useCaseQuery.trim())}
                      disabled={!useCaseQuery.trim()}
                      className="inline-flex min-h-9 items-center rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
                    >
                      Use this task in Workspace
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          {actionUseCases.length ? (
            <section className="xv-plugin-usecases rounded-[18px] border border-[var(--border-subtle)] p-4 sm:p-6">
              <div className="relative z-[1]">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">Real use cases</h2>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Real things Xroga can do with this app, grounded in its current actions.
                  </p>
                </div>

                <div className="mx-auto max-w-3xl space-y-3">
                  {actionUseCases.slice(0, 4).map((item) => (
                    <button
                      key={item.prompt}
                      type="button"
                      onClick={() => handleExample(item.prompt)}
                      className="xv-plugin-usecase-card group flex w-full min-h-[64px] items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] px-4 py-3 text-left text-sm text-[var(--text-primary)] shadow-subtle transition hover:-translate-y-0.5 hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] motion-reduce:transform-none"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <PluginBrandLogo
                          id={definition.id}
                          name={definition.name}
                          toolkit={catalog?.slug}
                          logo={catalog?.logo}
                          size="micro"
                        />
                        <span className="min-w-0 leading-5">
                          <strong className="font-semibold text-[var(--accent)]">
                            {definition.name}
                          </strong>{' '}
                          <span>{item.label}</span>
                        </span>
                      </span>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-inset)] text-[var(--text-primary)] transition group-hover:translate-x-0.5">
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          <section>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Capabilities</h2>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {tools.length
                    ? `${tools.length.toLocaleString()} loaded actions${toolsTotal > tools.length ? ` of ${toolsTotal.toLocaleString()}` : ''} from the current Xroga App.`
                    : 'Live action metadata for this Plugin.'}
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
                    placeholder={`Search ${definition.name} actions…`}
                    className="w-full rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-raised)] py-2.5 pl-9 pr-3 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  />
                </div>
              ) : null}
            </div>

            {loadingCapabilities ? (
              <div className="space-y-2" aria-label="Loading capabilities">
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="h-14 animate-pulse rounded-token-lg bg-[var(--surface-inset)]"
                  />
                ))}
              </div>
            ) : capabilityError && !tools.length ? (
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
                      onClick={() => void loadPlugin()}
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
                  ? 'No actions match this search.'
                  : 'No action metadata is available right now.'}
              </div>
            )}
          </section>

          {triggersTotal > 0 || triggers.length ? (
            <section>
              <div className="mb-3">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Triggers</h2>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Events this toolkit can expose for automations and workflows.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {triggers.map((trigger) => (
                  <div
                    key={trigger.slug}
                    className="rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{trigger.name}</p>
                      {trigger.type ? (
                        <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
                          {trigger.type}
                        </span>
                      ) : null}
                    </div>
                    {trigger.description ? (
                      <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                        {trigger.description}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
              {triggersTotal > triggers.length ? (
                <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                  Showing {triggers.length.toLocaleString()} of {triggersTotal.toLocaleString()} trigger types.
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  Permissions & safety
                </h2>
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

                <div className="mt-4 rounded-token-md border border-[var(--border-subtle)]">
                  <div className="px-3 py-2.5">
                    <p className="text-xs font-semibold text-[var(--text-primary)]">
                      Provider permissions
                      {scopes.length ? ` (${scopes.length})` : ''}
                    </p>
                    <p className="mt-1 text-[11px] leading-4 text-[var(--text-secondary)]">
                      Xroga derives these permissions from the app’s current live action metadata. They are the exact scope strings exposed for the actions loaded above.
                    </p>
                  </div>
                  {scopes.length ? (
                    <div className="flex max-h-52 flex-wrap gap-2 overflow-y-auto border-t border-[var(--border-subtle)] p-3">
                      {scopes.map((scope) => (
                        <code
                          key={scope}
                          className="rounded bg-[var(--surface-inset)] px-2 py-1 text-[10px] text-[var(--text-secondary)]"
                        >
                          {scope}
                        </code>
                      ))}
                    </div>
                  ) : (
                    <div className="border-t border-[var(--border-subtle)] p-3">
                      <p className="text-[11px] leading-4 text-[var(--text-secondary)]">
                        {noAuth
                          ? 'This app does not require an account authorization scope.'
                          : 'This provider does not expose explicit OAuth scope strings in the current action metadata. The read/write/sensitive classification above still applies to every loaded action.'}
                      </p>
                    </div>
                  )}
                </div>

                <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">
                  Unknown actions are never presented as read-only. Xroga’s server-side read/write/destructive classification and confirmation flow remains authoritative.
                </p>
              </div>
            </div>
          </section>

          {tools.length ? (
            <details className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">
                Advanced · all raw actions ({tools.length.toLocaleString()})
              </summary>
              <div className="max-h-[520px] overflow-y-auto border-t border-[var(--border-subtle)]">
                {tools.map((tool) => (
                  <RawActionRow key={tool.slug} tool={tool} />
                ))}
              </div>
            </details>
          ) : null}

          <section className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">About</h2>
            <dl className="mt-4 grid gap-4 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-[var(--text-muted)]">Plugin ID</dt>
                <dd className="mt-1 font-medium text-[var(--text-primary)]">
                  {catalog?.slug || pluginId}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">Version</dt>
                <dd className="mt-1 font-medium text-[var(--text-primary)]">
                  {catalog?.version || 'Current'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">Authentication</dt>
                <dd className="mt-1 font-medium text-[var(--text-primary)]">
                  {catalog?.noAuth
                    ? 'No authorization required'
                    : catalog?.managedAuthSchemes.length
                      ? `Managed: ${catalog.managedAuthSchemes.join(', ')}`
                      : catalog?.authSchemes.length
                        ? catalog.authSchemes.join(', ')
                        : definition.source === 'native'
                          ? 'Xroga native'
                          : 'Provider authorization'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">Categories</dt>
                <dd className="mt-1 font-medium text-[var(--text-primary)]">
                  {catalog?.categories.map((item) => item.name).join(', ') || definition.category}
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-3">
              {catalog?.appUrl ? (
                <a
                  href={catalog.appUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline"
                >
                  Provider website
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              ) : null}
              {catalog?.authGuideUrl ? (
                <a
                  href={catalog.authGuideUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline"
                >
                  Authentication guide
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </section>
        </main>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <section className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              {definition.source === 'native' ? 'Developer connection' : 'Connection'}
            </h2>
            <div className="mt-3">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {connected ? 'Connected' : native?.state === 'needs_attention' ? 'Needs attention' : noAuth ? 'Ready' : 'Not connected'}
              </p>
              {connected && connectionLabel ? (
                <div className="mt-2 rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Connected account
                  </p>
                  <p className="mt-1 break-words text-xs font-medium text-[var(--text-primary)]">
                    {connectionLabel}
                  </p>
                </div>
              ) : connectionLabel ? (
                <p className="mt-1 break-words text-xs text-[var(--text-secondary)]">{connectionLabel}</p>
              ) : null}
              {native?.statusMessage ? (
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{native.statusMessage}</p>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {definition.source === 'native' ? (
                !nativeConnected ? (
                  <button
                    type="button"
                    disabled={connecting}
                    onClick={() => void handleConnect()}
                    className="xv-plugin-connect-button inline-flex min-h-9 items-center gap-2 px-3 text-xs font-semibold disabled:opacity-50"
                  >
                    {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                    {native?.state === 'needs_attention' ? 'Reconnect' : 'Connect'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDisconnect(true)}
                    className="min-h-9 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-3 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-strong)]"
                  >
                    Manage connection
                  </button>
                )
              ) : !connected && !noAuth ? (
                <button
                  type="button"
                  disabled={connecting}
                  onClick={() => void handleConnect()}
                  className="xv-plugin-connect-button inline-flex min-h-9 items-center gap-2 px-3 text-xs font-semibold disabled:opacity-50"
                >
                  {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                  Connect
                </button>
              ) : (
                <span className="inline-flex min-h-9 items-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-3 text-xs font-semibold text-[var(--text-primary)]">
                  {noAuth ? 'Ready' : 'Manage'}
                </span>
              )}

              <PluginPermissionControl
                buttonOnly
                toolkit={permissionToolkit}
                pluginName={definition.name}
              />
            </div>
          </section>

          <section className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Information</h2>
            <dl className="mt-3 space-y-3 text-xs">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-[var(--text-muted)]">Category</dt>
                <dd className="text-right font-medium text-[var(--text-primary)]">{definition.category}</dd>
              </div>
              {definition.provider ? (
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-[var(--text-muted)]">Provider</dt>
                  <dd className="text-right font-medium text-[var(--text-primary)]">{definition.provider}</dd>
                </div>
              ) : null}
              <div className="flex items-start justify-between gap-4">
                <dt className="text-[var(--text-muted)]">Authorization</dt>
                <dd className="text-right font-medium text-[var(--text-primary)]">{authorizationLabel}</dd>
              </div>
              {catalog ? (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-[var(--text-muted)]">Actions</dt>
                    <dd className="text-right font-medium text-[var(--text-primary)]">
                      {catalog.toolsCount.toLocaleString()}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-[var(--text-muted)]">Triggers</dt>
                    <dd className="text-right font-medium text-[var(--text-primary)]">
                      {catalog.triggersCount.toLocaleString()}
                    </dd>
                  </div>
                </>
              ) : null}
              {(definition.websiteUrl || catalog?.appUrl) ? (
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-[var(--text-muted)]">Website</dt>
                  <dd>
                    <a
                      href={definition.websiteUrl || catalog?.appUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-[var(--accent)] hover:underline"
                    >
                      View
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </dd>
                </div>
              ) : null}
              {definition.privacyUrl ? (
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-[var(--text-muted)]">Privacy policy</dt>
                  <dd>
                    <a
                      href={definition.privacyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-[var(--accent)] hover:underline"
                    >
                      View
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </dd>
                </div>
              ) : null}
              {definition.termsUrl ? (
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-[var(--text-muted)]">Terms of service</dt>
                  <dd>
                    <a
                      href={definition.termsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-[var(--accent)] hover:underline"
                    >
                      View
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </dd>
                </div>
              ) : null}
              <div className="flex items-start justify-between gap-4">
                <dt className="text-[var(--text-muted)]">Authorization supported</dt>
                <dd className="max-w-[180px] text-right font-medium text-[var(--text-primary)]">
                  {authorizationLabel}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-[var(--text-muted)]">Authorization used</dt>
                <dd className="max-w-[180px] text-right font-medium text-[var(--text-primary)]">
                  {connected || noAuth ? authorizationLabel : 'Not connected'}
                </dd>
              </div>
            </dl>
          </section>

          {definition.source === 'native' && catalog ? (
            <section className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">AI actions</h2>
              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                Xroga’s developer connection and AI-action connection are separate. The runtime can request the app connection when an AI action needs it.
              </p>
              <p className="mt-3 text-xs font-medium text-[var(--text-primary)]">
                {composioConnected ? 'AI actions ready' : 'AI actions not connected'}
              </p>
              {!composioConnected && !catalog.noAuth ? (
                <button
                  type="button"
                  disabled={connectingComposio}
                  onClick={() => void handleConnectComposio()}
                  className="xv-plugin-connect-button mt-3 inline-flex min-h-9 items-center gap-2 px-3 text-xs font-semibold disabled:opacity-50"
                >
                  {connectingComposio ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                  Connect AI actions
                </button>
              ) : null}
            </section>
          ) : null}

          {confirmDisconnect ? (
            <section className="rounded-token-lg border border-amber-500/25 bg-amber-500/5 p-4">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Disconnect {definition.name}?
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                Xroga will stop using this native developer connection. External provider data is not deleted.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={disconnecting}
                  onClick={() => void handleDisconnect()}
                  className="min-h-9 rounded-token-sm bg-[var(--accent)] px-3 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDisconnect(false)}
                  className="min-h-9 rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)]"
                >
                  Cancel
                </button>
              </div>
            </section>
          ) : null}

          {definition.developer ? (
            <section className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-4">
              <p className="text-xs font-semibold text-[var(--text-primary)]">Developer Plugin</p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                Publishing stays separate from Plugin capabilities.
              </p>
              <Link
                href={
                  definition.id === 'vercel' || definition.id === 'supabase'
                    ? '/dashboard/publish?target=web'
                    : definition.id === 'expo'
                      ? '/dashboard/publish?target=mobile'
                      : '/dashboard/publish'
                }
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline"
              >
                Open Publish
                <ChevronDown className="h-3 w-3 -rotate-90" aria-hidden="true" />
              </Link>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}