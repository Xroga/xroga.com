'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  KeyRound,
  Loader2,
  RefreshCw,
  Server,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { PluginBrandLogo } from '@/components/integrations/PluginBrandLogo';
import {
  clearOAuthResult,
  subscribeOAuthResults,
} from '@/lib/oauthPopupResult';
import {
  xrogaConnect,
  type XrogaConnectCatalogToolkit,
  type XrogaConnectToolkit,
  type XrogaCustomMcpAuthMode,
} from '@/lib/xrogaConnect';

function customDetailHref(toolkit: string): string {
  return `/dashboard/integrations/${encodeURIComponent(toolkit)}`;
}

export function CustomMcpCreateForm({
  onCreated,
  onBack,
}: {
  onCreated?: (toolkit: string) => void;
  onBack?: () => void;
}) {
  const [name, setName] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [authMode, setAuthMode] = useState<XrogaCustomMcpAuthMode>('none');
  const [headerName, setHeaderName] = useState('Authorization');
  const [headerPrefix, setHeaderPrefix] = useState('Bearer ');
  const [discoveryUrl, setDiscoveryUrl] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    const cleanName = name.trim();
    const cleanUrl = serverUrl.trim();

    if (cleanName.length < 2) {
      toast.error('Add a name for this MCP server');
      return;
    }

    if (!/^https:\/\//i.test(cleanUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(cleanUrl)) {
      toast.error('Use a public HTTPS MCP server URL');
      return;
    }

    if (authMode === 'dcr_oauth' && !discoveryUrl.trim()) {
      toast.error('Add the OAuth discovery URL');
      return;
    }

    const authPopup =
      authMode === 'none'
        ? null
        : window.open(
            '',
            'xroga-custom-mcp-auth',
            'width=600,height=760,resizable=yes,scrollbars=yes',
          );

    setBusy(true);

    try {
      const result = await xrogaConnect.customMcp.create({
        name: cleanName,
        serverUrl: cleanUrl,
        authMode,
        ...(authMode === 'api_key'
          ? {
              headerName: headerName.trim() || 'Authorization',
              headerPrefix,
            }
          : {}),
        ...(authMode === 'dcr_oauth'
          ? {
              discoveryUrl: discoveryUrl.trim(),
            }
          : {}),
      });

      onCreated?.(result.slug);

      if (authMode === 'none') {
        toast.success('Custom MCP created and tool sync started');
      } else {
        const session = await xrogaConnect.session();
        const link = await xrogaConnect.link(session.sessionId, result.slug);

        if (!link.redirectUrl) {
          throw new Error('The connection flow did not return an authorization URL.');
        }

        if (authPopup) {
          authPopup.location.href = link.redirectUrl;
          authPopup.focus();
        } else {
          window.location.href = link.redirectUrl;
          return;
        }

        toast.success('Custom MCP created — finish connecting the account');
      }

      setName('');
      setServerUrl('');
      setDiscoveryUrl('');
    } catch (error) {
      try {
        authPopup?.close();
      } catch {
        // Browser may already have closed the window.
      }
      toast.error(error instanceof Error ? error.message : 'Could not create Custom MCP');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="xv-plugin-back-btn inline-flex min-h-9 items-center gap-1.5 px-3 text-xs font-semibold"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back
        </button>
      ) : null}

      <div>
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Custom MCP server</h3>
        </div>
        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
          Register a remote MCP server as an Xroga Plugin. Its synced tools become searchable and usable through the same Plugin runtime.
        </p>
      </div>

      <div className="grid gap-3">
        <label className="grid gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
          Plugin name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Internal CRM"
            maxLength={80}
            className="rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-sm font-normal outline-none focus:border-[var(--accent)]"
          />
        </label>

        <label className="grid gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
          MCP server URL
          <input
            value={serverUrl}
            onChange={(event) => setServerUrl(event.target.value)}
            placeholder="https://mcp.example.com/mcp"
            className="rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-sm font-normal outline-none focus:border-[var(--accent)]"
          />
        </label>

        <label className="grid gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
          Authentication
          <select
            value={authMode}
            onChange={(event) => setAuthMode(event.target.value as XrogaCustomMcpAuthMode)}
            className="rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-sm font-normal outline-none focus:border-[var(--accent)]"
          >
            <option value="none">No authentication</option>
            <option value="api_key">API key</option>
            <option value="dcr_oauth">OAuth (Dynamic Client Registration)</option>
          </select>
        </label>

        {authMode === 'api_key' ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
              Header
              <input
                value={headerName}
                onChange={(event) => setHeaderName(event.target.value)}
                placeholder="Authorization"
                className="rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-sm font-normal outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
              Value prefix
              <input
                value={headerPrefix}
                onChange={(event) => setHeaderPrefix(event.target.value)}
                placeholder="Bearer "
                className="rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-sm font-normal outline-none focus:border-[var(--accent)]"
              />
            </label>
          </div>
        ) : null}

        {authMode === 'dcr_oauth' ? (
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
            OAuth discovery URL
            <input
              value={discoveryUrl}
              onChange={(event) => setDiscoveryUrl(event.target.value)}
              placeholder="https://mcp.example.com/.well-known/oauth-authorization-server"
              className="rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-sm font-normal outline-none focus:border-[var(--accent)]"
            />
          </label>
        ) : null}
      </div>

      <div className="rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3 text-xs leading-5 text-[var(--text-secondary)]">
        Xroga supports remote MCP servers over HTTPS. API-key and OAuth servers require an account connection after the Plugin is registered.
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void create()}
        className="xv-plugin-connect-btn inline-flex min-h-10 w-full items-center justify-center gap-2 px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Server className="h-4 w-4" aria-hidden="true" />}
        {busy ? 'Creating…' : 'Create Plugin'}
      </button>
    </div>
  );
}

export function CustomMcpManager() {
  const [items, setItems] = useState<XrogaConnectCatalogToolkit[]>([]);
  const [connections, setConnections] = useState<Record<string, XrogaConnectToolkit>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await xrogaConnect.customMcp.list();
      setItems(result.items ?? []);

      if (result.items?.length) {
        const session = await xrogaConnect.session();
        setSessionId(session.sessionId);

        try {
          const state = await xrogaConnect.toolkits(session.sessionId, {
            toolkits: result.items.map((item) => item.slug),
          });
          setConnections(
            Object.fromEntries(
              (state.toolkits ?? []).map((item) => [item.toolkit, item]),
            ),
          );
        } catch {
          setConnections({});
        }
      } else {
        setConnections({});
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load Custom MCP Plugins');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () =>
      subscribeOAuthResults((payload) => {
        if (payload.type === 'xroga-composio-connected') {
          toast.success('Custom MCP connected');
          void load();
        }
        if (payload.type === 'xroga-composio-error') {
          toast.error(payload.message || 'Custom MCP connection failed');
        }
      }),
    [load],
  );

  async function connect(toolkit: XrogaConnectCatalogToolkit) {
    const popup = window.open(
      '',
      'xroga-custom-mcp-auth',
      'width=600,height=760,resizable=yes,scrollbars=yes',
    );

    setBusy(`connect:${toolkit.slug}`);
    try {
      clearOAuthResult();
      let activeSession = sessionId;
      if (!activeSession) {
        const session = await xrogaConnect.session();
        activeSession = session.sessionId;
        setSessionId(activeSession);
      }

      const result = await xrogaConnect.link(activeSession, toolkit.slug);
      if (!result.redirectUrl) throw new Error('Authorization URL was not returned.');

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
      toast.error(error instanceof Error ? error.message : 'Could not connect Custom MCP');
    } finally {
      setBusy(null);
    }
  }

  async function sync(toolkit: XrogaConnectCatalogToolkit) {
    setBusy(`sync:${toolkit.slug}`);
    try {
      const connection = connections[toolkit.slug];
      const result = await xrogaConnect.customMcp.sync(
        toolkit.slug,
        connection?.connectedAccountId,
      );
      toast.success(
        result.syncedCount !== undefined
          ? `Synced ${result.syncedCount} MCP tools`
          : 'MCP tools synced',
      );
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not sync MCP tools');
    } finally {
      setBusy(null);
    }
  }

  async function remove(toolkit: XrogaConnectCatalogToolkit) {
    setBusy(`remove:${toolkit.slug}`);
    try {
      await xrogaConnect.customMcp.remove(toolkit.slug);
      toast.success('Custom MCP removed');
      setRemoveConfirm(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove Custom MCP');
    } finally {
      setBusy(null);
    }
  }

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.name.localeCompare(b.name)),
    [items],
  );

  return (
    <section className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Custom MCP Plugins</h3>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--text-secondary)]">
            Register your own remote MCP server, connect its account when needed, and sync its tools into Xroga.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((value) => !value)}
          className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-strong)]"
        >
          {showCreate ? 'Close' : '+ Add MCP server'}
        </button>
      </div>

      {showCreate ? (
        <div className="border-t border-[var(--border-subtle)] p-4">
          <div className="mx-auto max-w-xl">
            <CustomMcpCreateForm
              onCreated={() => {
                setShowCreate(false);
                void load();
              }}
            />
          </div>
        </div>
      ) : null}

      <div className="border-t border-[var(--border-subtle)]">
        {loading ? (
          <div className="flex min-h-24 items-center justify-center gap-2 text-xs text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading Custom MCP Plugins…
          </div>
        ) : sorted.length ? (
          <div className="divide-y divide-[var(--border-subtle)]">
            {sorted.map((item) => {
              const connection = connections[item.slug];
              const connected = item.noAuth || connection?.connected;
              const connectBusy = busy === `connect:${item.slug}`;
              const syncBusy = busy === `sync:${item.slug}`;
              const removeBusy = busy === `remove:${item.slug}`;

              return (
                <div key={item.slug} className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Link
                      href={customDetailHref(item.slug)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                    >
                      <PluginBrandLogo
                        id={item.slug}
                        name={item.name}
                        toolkit={item.slug}
                        logo={item.logo}
                      />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <strong className="truncate text-sm font-semibold text-[var(--text-primary)]">
                            {item.name}
                          </strong>
                          <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
                            Custom MCP
                          </span>
                          {connected ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                              <Check className="h-3 w-3" aria-hidden="true" />
                              {item.noAuth ? 'Ready' : 'Connected'}
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">
                          {item.toolsCount.toLocaleString()} actions
                          {item.triggersCount ? ` · ${item.triggersCount.toLocaleString()} triggers` : ''}
                        </span>
                      </span>
                    </Link>

                    <div className="flex flex-wrap items-center gap-2">
                      {!connected && !item.noAuth ? (
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void connect(item)}
                          className="xv-plugin-connect-btn inline-flex min-h-9 items-center gap-1.5 px-3 text-xs font-semibold disabled:opacity-50"
                        >
                          {connectBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />}
                          Connect
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy !== null || (!item.noAuth && !connection?.connectedAccountId)}
                        onClick={() => void sync(item)}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-45"
                      >
                        {syncBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
                        Sync
                      </button>
                      <Link
                        href={customDetailHref(item.slug)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-primary)] hover:bg-[var(--surface-inset)]"
                        aria-label={`Open ${item.name}`}
                      >
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => setRemoveConfirm(item.slug)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--danger-dim)] hover:text-[var(--danger)] disabled:opacity-50"
                        aria-label={`Remove ${item.name}`}
                      >
                        {removeBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                      </button>
                    </div>
                  </div>

                  {removeConfirm === item.slug ? (
                    <div className="mt-3 flex flex-col gap-2 rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs leading-5 text-[var(--text-secondary)]">
                        Remove {item.name}? This removes the Plugin, its synced tools and its external connection from Xroga. It does not delete data from the MCP server.
                      </p>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => setRemoveConfirm(null)}
                          className="min-h-9 rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)]"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void remove(item)}
                          className="min-h-9 rounded-token-sm bg-[var(--danger)] px-3 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4 text-xs leading-5 text-[var(--text-secondary)]">
            No Custom MCP Plugins yet. Add a remote HTTPS MCP server when you need a service outside the built-in app catalogue.
          </div>
        )}
      </div>
    </section>
  );
}
