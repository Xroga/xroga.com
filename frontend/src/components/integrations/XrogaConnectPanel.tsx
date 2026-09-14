'use client';

import {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  Check,
  ExternalLink,
  Loader2,
  PlugZap,
  Search,
  ShieldCheck,
} from 'lucide-react';

import toast from 'react-hot-toast';

import {
  xrogaConnect,
  type XrogaConnectToolkit,
  type XrogaConnectTool,
} from '@/lib/xrogaConnect';

import {
  clearOAuthResult,
  subscribeOAuthResults,
} from '@/lib/oauthPopupResult';

import {
  SettingsPanelHeader,
} from '@/components/settings/SettingsPrimitives';

const QUICK_APPS = [
  {
    name: 'Gmail',
    query:
      'read recent Gmail emails',
  },
  {
    name: 'Google Calendar',
    query:
      'read upcoming Google Calendar events',
  },
  {
    name: 'Google Drive',
    query:
      'find and read Google Drive files',
  },
  {
    name: 'Slack',
    query:
      'read recent Slack messages',
  },
  {
    name: 'Stripe',
    query:
      'read recent Stripe payments and sales',
  },
  {
    name: 'Shopify',
    query:
      'read Shopify orders and store information',
  },
  {
    name: 'HubSpot',
    query:
      'read HubSpot contacts and deals',
  },
  {
    name: 'Notion',
    query:
      'read Notion pages',
  },
  {
    name: 'Airtable',
    query:
      'read Airtable records',
  },
  {
    name: 'QuickBooks',
    query:
      'read QuickBooks accounting information',
  },
  {
    name: 'Linear',
    query:
      'read Linear issues',
  },
  {
    name: 'Sentry',
    query:
      'read Sentry errors and issues',
  },
] as const;

function displayToolkitName(
  toolkit: string,
): string {
  return toolkit
    .split(/[_-]/g)
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1),
    )
    .join(' ');
}

export function XrogaConnectPanel() {
  const [
    configured,
    setConfigured,
  ] =
    useState<boolean | null>(
      null,
    );

  const [
    query,
    setQuery,
  ] =
    useState('');

  const [
    sessionId,
    setSessionId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    toolkits,
    setToolkits,
  ] =
    useState<
      XrogaConnectToolkit[]
    >([]);

  const [
    tools,
    setTools,
  ] =
    useState<
      XrogaConnectTool[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    connectingToolkit,
    setConnectingToolkit,
  ] =
    useState<string | null>(
      null,
    );

  const lastQuery =
    useRef('');

  async function runSearch(
    nextQuery: string,
  ) {
    const clean =
      nextQuery.trim();

    if (
      clean.length < 2 ||
      loading
    ) {
      return;
    }

    lastQuery.current =
      clean;

    setQuery(clean);
    setLoading(true);

    try {
      const result =
        await xrogaConnect.search(
          clean,
          sessionId ??
            undefined,
        );

      setSessionId(
        result.sessionId,
      );

      setToolkits(
        result.toolkits ??
          [],
      );

      setTools(
        result.tools ?? [],
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not search connected apps',
      );
    } finally {
      setLoading(false);
    }
  }

  async function connectToolkit(
    toolkit: string,
  ) {
    if (
      connectingToolkit ||
      !sessionId
    ) {
      return;
    }

    setConnectingToolkit(
      toolkit,
    );

    clearOAuthResult();

    /*
     * Open first to avoid browser
     * popup blockers while we wait
     * for the backend link.
     */
    const popup =
      window.open(
        '',
        'xroga-connect-oauth',
        'width=600,height=760,resizable=yes,scrollbars=yes',
      );

    try {
      const result =
        await xrogaConnect.link(
          sessionId,
          toolkit,
        );

      if (
        !result.redirectUrl
      ) {
        throw new Error(
          'Authorization link was not returned.',
        );
      }

      if (popup) {
        popup.location.href =
          result.redirectUrl;

        popup.focus();
      } else {
        /*
         * Safe fallback when popup
         * blocking is enabled.
         */
        window.location.href =
          result.redirectUrl;
      }
    } catch (error) {
      try {
        popup?.close();
      } catch {
        // Ignore.
      }

      setConnectingToolkit(
        null,
      );

      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not start authorization',
      );
    }
  }

  useEffect(() => {
    let active = true;

    void xrogaConnect
      .status()
      .then((status) => {
        if (!active) {
          return;
        }

        setConfigured(
          status.configured,
        );
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setConfigured(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return subscribeOAuthResults(
      (payload) => {
        if (
          payload.type ===
          'xroga-composio-connected'
        ) {
          setConnectingToolkit(
            null,
          );

          toast.success(
            'App connected to Xroga',
          );

          if (
            lastQuery.current
          ) {
            void runSearch(
              lastQuery.current,
            );
          }
        }

        if (
          payload.type ===
          'xroga-composio-error'
        ) {
          setConnectingToolkit(
            null,
          );

          toast.error(
            payload.message ||
              'App connection failed',
          );
        }
      },
    );
  });

  if (
    configured === null
  ) {
    return (
      <div className="glass-panel rounded-token-lg p-4">
        <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
          <Loader2
            className="h-4 w-4 animate-spin"
            aria-hidden="true"
          />

          Checking Xroga Connect…
        </div>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="glass-panel rounded-token-lg p-4">
        <SettingsPanelHeader
          icon={
            <PlugZap
              className="h-4 w-4 text-[var(--accent)]"
              aria-hidden="true"
            />
          }
          title="Xroga Connect"
          description="External business apps are not configured on the Xroga backend yet."
        />

        <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">
          Xroga Connect will become available when the server-side integration is enabled.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-token-lg p-4 space-y-4">
      <SettingsPanelHeader
        icon={
          <PlugZap
            className="h-4 w-4 text-[var(--accent)]"
            aria-hidden="true"
          />
        }
        title="Xroga Connect"
        description="Connect the apps your business already uses. Xroga can securely read connected services when a task needs them."
      />

      <div className="flex items-start gap-2 rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3">
        <ShieldCheck
          className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]"
          aria-hidden="true"
        />

        <div>
          <p className="text-xs font-semibold text-[var(--text-primary)]">
            Read-only protection
          </p>

          <p className="mt-0.5 text-[11px] leading-5 text-[var(--text-secondary)]">
            Xroga cannot send, delete, refund, publish, or modify connected-app data in this release.
          </p>
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();

          void runSearch(
            query,
          );
        }}
        className="flex gap-2"
      >
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden="true"
          />

          <input
            value={query}
            onChange={(event) =>
              setQuery(
                event.target.value,
              )
            }
            placeholder="What do you want Xroga to access?"
            className="w-full rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-inset)] py-2.5 pl-10 pr-3 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          />
        </div>

        <button
          type="submit"
          disabled={
            loading ||
            query.trim().length <
              2
          }
          className="rounded-token-sm bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] disabled:opacity-50"
        >
          {loading ? (
            <Loader2
              className="h-4 w-4 animate-spin"
              aria-hidden="true"
            />
          ) : (
            'Find'
          )}
        </button>
      </form>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Popular
        </p>

        <div className="flex flex-wrap gap-2">
          {QUICK_APPS.map(
            (app) => (
              <button
                key={app.name}
                type="button"
                disabled={loading}
                onClick={() =>
                  void runSearch(
                    app.query,
                  )
                }
                className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--accent)]/50 hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                {app.name}
              </button>
            ),
          )}
        </div>
      </div>

      {toolkits.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Apps
          </p>

          {toolkits.map(
            (item) => (
              <div
                key={
                  item.toolkit
                }
                className="flex items-center justify-between gap-3 rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                    {displayToolkitName(
                      item.toolkit,
                    )}
                  </p>

                  <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-secondary)]">
                    {item.description ||
                      item.statusMessage ||
                      'Business app connection'}
                  </p>
                </div>

                {item.connected ? (
                  <div className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[var(--accent)]">
                    <Check
                      className="h-4 w-4"
                      aria-hidden="true"
                    />

                    Connected
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={
                      Boolean(
                        connectingToolkit,
                      )
                    }
                    onClick={() =>
                      void connectToolkit(
                        item.toolkit,
                      )
                    }
                    className="flex shrink-0 items-center gap-1.5 rounded-token-sm border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent)]/50 disabled:opacity-50"
                  >
                    {connectingToolkit ===
                    item.toolkit ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <ExternalLink
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                    )}

                    Connect
                  </button>
                )}
              </div>
            ),
          )}
        </div>
      ) : null}

      {tools.length > 0 ? (
        <div className="rounded-token-md border border-[var(--border-subtle)] p-3">
          <p className="text-xs font-semibold text-[var(--text-primary)]">
            {tools.length}{' '}
            read capability
            {tools.length === 1
              ? ''
              : 'ies'}{' '}
            found
          </p>

          <p className="mt-1 text-[11px] leading-5 text-[var(--text-muted)]">
            Xroga will use these capabilities automatically when they are relevant to your request.
          </p>
        </div>
      ) : null}
    </div>
  );
}
