'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  KeyRound,
  Loader2,
  PlugZap,
  Search,
  Server,
  Trash2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { ConnectedServicesSection } from '@/components/integrations/ConnectedServicesSection';
import { CustomCredentialsSection } from '@/components/integrations/CustomCredentialsSection';
import { xrogaConnect, type XrogaCustomMcp } from '@/lib/xrogaConnect';

type AddPluginTab = 'apps' | 'mcp' | 'credentials';

export function AddPluginModal({
  open,
  onClose,
  onSearch,
}: {
  open: boolean;
  onClose: () => void;
  onSearch: (query: string) => void;
}) {
  const [tab, setTab] = useState<AddPluginTab>('apps');
  const [search, setSearch] = useState('');
  const [custom, setCustom] = useState<XrogaCustomMcp[]>([]);
  const [loadingCustom, setLoadingCustom] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [authMode, setAuthMode] = useState<'no_auth' | 'api_key' | 'dcr_oauth'>('no_auth');
  const [discoveryUrl, setDiscoveryUrl] = useState('');

  const canCreate = useMemo(
    () =>
      name.trim().length >= 2 &&
      slug.trim().length >= 2 &&
      serverUrl.trim().startsWith('https://') &&
      (authMode !== 'dcr_oauth' || discoveryUrl.trim().startsWith('https://')),
    [name, slug, serverUrl, authMode, discoveryUrl],
  );

  async function loadCustom() {
    setLoadingCustom(true);
    try {
      const result = await xrogaConnect.customMcpList();
      setCustom(result.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load Custom Plugins');
    } finally {
      setLoadingCustom(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    if (tab === 'mcp') void loadCustom();
  }, [open, tab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function createCustomMcp() {
    if (!canCreate || busy) return;
    setBusy('create');
    try {
      const result = await xrogaConnect.customMcpCreate({
        name: name.trim(),
        slug: slug.trim(),
        serverUrl: serverUrl.trim(),
        authMode,
        ...(authMode === 'dcr_oauth' ? { discoveryUrl: discoveryUrl.trim() } : {}),
      });
      setName('');
      setSlug('');
      setServerUrl('');
      setDiscoveryUrl('');
      setAuthMode('no_auth');
      toast.success(
        result.connectRequired
          ? 'Custom Plugin created. Connect its account when you are ready.'
          : 'Custom Plugin created and synced.',
      );
      await loadCustom();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create Custom Plugin');
    } finally {
      setBusy(null);
    }
  }

  async function syncCustomMcp(item: XrogaCustomMcp) {
    if (busy) return;
    setBusy(`sync:${item.toolkit}`);
    try {
      const result = await xrogaConnect.customMcpSync(item.toolkit);
      toast.success(
        typeof result.syncedCount === 'number'
          ? `Synced ${result.syncedCount} tools`
          : 'Custom Plugin synced',
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not sync Custom Plugin');
    } finally {
      setBusy(null);
    }
  }

  async function connectCustomMcp(item: XrogaCustomMcp) {
    if (busy) return;
    setBusy(`connect:${item.toolkit}`);

    try {
      const session = await xrogaConnect.session({ toolkits: [item.toolkit] });
      const popup = window.open(
        '',
        'xroga-custom-plugin-oauth',
        'width=600,height=760,resizable=yes,scrollbars=yes',
      );
      const result = await xrogaConnect.link(session.sessionId, item.toolkit);

      if (!result.redirectUrl) {
        popup?.close();
        throw new Error('Authorization link was not returned.');
      }

      if (popup) {
        popup.location.href = result.redirectUrl;
        popup.focus();
      } else {
        window.location.href = result.redirectUrl;
      }

      toast.success('Continue authorization in the provider window');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not connect Custom Plugin');
    } finally {
      setBusy(null);
    }
  }

  async function removeCustomMcp(item: XrogaCustomMcp) {
    if (busy) return;
    if (!window.confirm(`Remove ${item.name}? This also revokes its Custom Plugin connections.`)) {
      return;
    }

    setBusy(`delete:${item.toolkit}`);
    try {
      await xrogaConnect.customMcpDelete(item.toolkit);
      toast.success('Custom Plugin removed');
      await loadCustom();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove Custom Plugin');
    } finally {
      setBusy(null);
    }
  }

  function submitSearch() {
    const clean = search.trim();
    if (!clean) return;
    onSearch(clean);
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[420] flex items-start justify-center bg-black/45 p-3 pt-[8vh] backdrop-blur-[2px] sm:p-5 sm:pt-[10vh]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-plugin-title"
        className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--background)] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-4 sm:px-5">
          <div>
            <h2 id="add-plugin-title" className="text-base font-semibold text-[var(--text-primary)]">
              Add Plugin
            </h2>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              Connect an Xroga App, register a remote MCP server, or add a credential.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Add Plugin"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-inset)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-[var(--border-subtle)] px-3 pt-2" aria-label="Add Plugin options">
          {([
            ['apps', 'Xroga Apps', Search],
            ['mcp', 'Custom MCP', Server],
            ['credentials', 'Credentials', KeyRound],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={
                tab === id
                  ? 'flex min-h-10 shrink-0 items-center gap-2 border-b-2 border-[var(--accent)] px-3 text-xs font-semibold text-[var(--text-primary)]'
                  : 'flex min-h-10 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {tab === 'apps' ? (
            <div className="space-y-4">
              <div className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
                <div className="flex items-start gap-3">
                  <PlugZap className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      Connect almost any supported app
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                      Search by brand or describe the job you want Xroga to do. The Plugin directory uses the complete live Xroga Apps catalogue.
                    </p>
                  </div>
                </div>
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  submitSearch();
                }}
                className="flex gap-2"
              >
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
                  <input
                    autoFocus
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search Gmail, HubSpot, Canva, flights, invoices…"
                    className="w-full rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-raised)] py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!search.trim()}
                  className="min-h-10 rounded-token-sm bg-[var(--accent)] px-4 text-xs font-semibold text-white disabled:opacity-45"
                >
                  Find
                </button>
              </form>

              <p className="text-[11px] leading-5 text-[var(--text-muted)]">
                Xroga loads app actions only when needed, so the directory can stay fast even with a large Plugin catalogue.
              </p>
            </div>
          ) : null}

          {tab === 'mcp' ? (
            <div className="space-y-5">
              <div className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Register remote MCP server</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                  Use a public HTTPS MCP endpoint. Xroga registers its tools as a user-owned Custom Plugin, keeps it isolated to your account in Xroga, and supports no-auth, API-key, and dynamic OAuth servers.
                </p>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <input
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      if (!slug) {
                        setSlug(
                          event.target.value
                            .toUpperCase()
                            .replace(/[^A-Z0-9]+/g, '_')
                            .replace(/^_+|_+$/g, '')
                            .slice(0, 32),
                        );
                      }
                    }}
                    placeholder="Plugin name"
                    className="rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-xs"
                  />
                  <input
                    value={slug}
                    onChange={(event) => setSlug(event.target.value)}
                    placeholder="PLUGIN_SLUG"
                    className="rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-xs font-mono"
                  />
                  <input
                    value={serverUrl}
                    onChange={(event) => setServerUrl(event.target.value)}
                    placeholder="https://mcp.example.com/mcp"
                    className="sm:col-span-2 rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-xs"
                  />
                  <select
                    value={authMode}
                    onChange={(event) =>
                      setAuthMode(event.target.value as 'no_auth' | 'api_key' | 'dcr_oauth')
                    }
                    className="rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-xs"
                  >
                    <option value="no_auth">No authentication</option>
                    <option value="api_key">API key / bearer token</option>
                    <option value="dcr_oauth">Dynamic OAuth (DCR)</option>
                  </select>
                  {authMode === 'dcr_oauth' ? (
                    <input
                      value={discoveryUrl}
                      onChange={(event) => setDiscoveryUrl(event.target.value)}
                      placeholder="https://server/.well-known/oauth-authorization-server"
                      className="rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-xs"
                    />
                  ) : (
                    <div className="rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-3 py-2.5 text-[11px] leading-4 text-[var(--text-secondary)]">
                      {authMode === 'api_key'
                        ? 'The secret is collected during the provider connection flow, not stored in this form.'
                        : 'No account authorization is required.'}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!canCreate || busy !== null}
                  onClick={() => void createCustomMcp()}
                  className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-token-sm bg-[var(--accent)] px-4 text-xs font-semibold text-white disabled:opacity-45"
                >
                  {busy === 'create' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                  Create Custom Plugin
                </button>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Your Custom Plugins
                  </h3>
                  <button
                    type="button"
                    onClick={() => void loadCustom()}
                    className="text-[11px] font-semibold text-[var(--accent)] hover:underline"
                  >
                    Refresh
                  </button>
                </div>

                {loadingCustom ? (
                  <div className="flex items-center gap-2 py-4 text-xs text-[var(--text-secondary)]">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Loading…
                  </div>
                ) : custom.length ? (
                  <div className="divide-y divide-[var(--border-subtle)] rounded-token-lg border border-[var(--border-subtle)]">
                    {custom.map((item) => (
                      <div key={item.toolkit} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{item.name}</p>
                          <p className="mt-0.5 truncate text-[10px] font-mono text-[var(--text-muted)]">{item.serverUrl}</p>
                          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                            {item.authMode === 'no_auth'
                              ? 'No authentication'
                              : item.authMode === 'api_key'
                                ? 'API key connection'
                                : 'Dynamic OAuth connection'}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {item.authMode !== 'no_auth' ? (
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => void connectCustomMcp(item)}
                              className="min-h-8 rounded-token-sm border border-[var(--border-subtle)] px-2.5 text-[11px] font-semibold text-[var(--text-primary)] disabled:opacity-50"
                            >
                              Connect
                            </button>
                          ) : null}
                          {item.authMode === 'no_auth' ? (
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => void syncCustomMcp(item)}
                              className="min-h-8 rounded-token-sm border border-[var(--border-subtle)] px-2.5 text-[11px] font-semibold text-[var(--text-primary)] disabled:opacity-50"
                            >
                              Sync tools
                            </button>
                          ) : null}
                          <a
                            href={`/dashboard/integrations/${encodeURIComponent(item.toolkit.toLowerCase())}`}
                            className="inline-flex min-h-8 items-center rounded-token-sm border border-[var(--border-subtle)] px-2.5 text-[11px] font-semibold text-[var(--text-primary)]"
                          >
                            Details
                          </a>
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void removeCustomMcp(item)}
                            aria-label={`Remove ${item.name}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-token-sm text-red-500 hover:bg-red-500/10 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-token-lg border border-dashed border-[var(--border-subtle)] p-4 text-xs text-[var(--text-secondary)]">
                    No Custom MCP Plugins yet.
                  </p>
                )}
              </div>
            </div>
          ) : null}

          {tab === 'credentials' ? (
            <div className="space-y-4">
              <ConnectedServicesSection compact />
              <CustomCredentialsSection compact />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
