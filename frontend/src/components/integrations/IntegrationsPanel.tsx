'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ChevronDown,
  Search,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { INTEGRATIONS } from '@/lib/integrations';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

import { IntegrationLogo } from '@/components/integrations/IntegrationLogo';
import { ConnectedServicesSection } from '@/components/integrations/ConnectedServicesSection';
import { CustomCredentialsSection } from '@/components/integrations/CustomCredentialsSection';
import { IntegrationRequestBanner } from '@/components/integrations/IntegrationRequestBanner';
import { ConnectShipWizard } from '@/components/integrations/ConnectShipWizard';

import { UserOwnedPublishPanel } from '@/components/publish/UserOwnedPublishPanel';

import { Badge } from '@/components/ui/Badge';

import {
  SettingsDivider,
  SettingsPanelHeader,
  SettingsStack,
} from '@/components/settings/SettingsPrimitives';

import {
  CONNECTABLE_INTEGRATION_IDS,
  isConnectableIntegration,
} from '@/lib/connectableIntegrations';

export function IntegrationsPanel() {
  const [search, setSearch] = useState('');
  const [comingSoonOpen, setComingSoonOpen] =
    useState(false);

  /*
   * null = checking
   * false = beginner / GitHub not connected
   * true = GitHub connected
   */
  const [
    githubConnected,
    setGithubConnected,
  ] = useState<boolean | null>(null);

  const [
    connectingGithub,
    setConnectingGithub,
  ] = useState(false);

  /*
   * Determine whether the user should see the beginner
   * GitHub-only onboarding state or the full integrations page.
   */
  useEffect(() => {
    let active = true;

    void api.github
      .status()
      .then((status) => {
        if (!active) return;

        setGithubConnected(
          Boolean(status.connected),
        );
      })
      .catch(() => {
        if (!active) return;

        setGithubConnected(false);
      });

    return () => {
      active = false;
    };
  }, []);

  /*
   * Surface OAuth callback messages, then scrub them
   * from the browser URL.
   */
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const query =
      new URLSearchParams(
        window.location.search,
      );

    const vercel =
      query.get('vercel');

    const github =
      query.get('github');

    const supabase =
      query.get('supabase');

    const message =
      query.get('message');

    if (vercel === 'connected') {
      toast.success(
        query.get('username')
          ? `Vercel connected as @${query.get('username')}`
          : 'Vercel connected',
      );
    } else if (
      vercel === 'error' ||
      vercel === 'missing_code'
    ) {
      toast.error(
        message ||
          'Vercel authorize failed — try again',
      );
    } else if (
      vercel === 'setup' ||
      query.get('focus') === 'vercel'
    ) {
      try {
        const stored =
          sessionStorage.getItem(
            'xroga-vercel-setup-error',
          );

        if (stored) {
          toast.error(stored);

          sessionStorage.removeItem(
            'xroga-vercel-setup-error',
          );
        } else {
          toast(
            'Connect Vercel here, approve deployment access, then choose a project',
            {
              icon: '▲',
            },
          );
        }
      } catch {
        toast(
          'Connect Vercel in Ship setup below',
          {
            icon: '▲',
          },
        );
      }

      setTimeout(() => {
        document
          .getElementById('ship-setup')
          ?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
      }, 200);
    }

    if (github === 'connected') {
      /*
       * Immediately reveal the full integrations page
       * after a successful GitHub OAuth return.
       */
      setGithubConnected(true);

      toast.success(
        query.get('username')
          ? `GitHub connected as @${query.get('username')}`
          : 'GitHub connected',
      );
    } else if (
      github === 'error' ||
      github === 'missing_code'
    ) {
      setGithubConnected(false);

      toast.error(
        message ||
          'GitHub authorize failed — try again',
      );
    }

    if (supabase === 'connected') {
      toast.success(
        'Supabase authorized',
      );
    } else if (
      supabase === 'error' ||
      supabase === 'missing_code'
    ) {
      toast.error(
        message ||
          'Supabase authorize failed — try again',
      );
    }

    if (
      vercel ||
      github ||
      supabase
    ) {
      const url =
        new URL(
          window.location.href,
        );

      [
        'vercel',
        'github',
        'supabase',
        'message',
        'username',
        'pick',
      ].forEach((key) =>
        url.searchParams.delete(key),
      );

      window.history.replaceState(
        {},
        '',
        url.pathname + url.search,
      );
    }
  }, []);

  const comingSoon = useMemo(() => {
    const query =
      search
        .toLowerCase()
        .trim();

    const list =
      INTEGRATIONS.filter(
        (integration) =>
          !isConnectableIntegration(
            integration.id,
          ),
      );

    if (!query) {
      return list;
    }

    return list.filter(
      (integration) =>
        integration.name
          .toLowerCase()
          .includes(query) ||
        integration.category
          .toLowerCase()
          .includes(query),
    );
  }, [search]);

  const noResults =
    search.trim().length > 0 &&
    comingSoon.length === 0;

  async function connectGithub() {
    if (connectingGithub) {
      return;
    }

    setConnectingGithub(true);

    try {
      const { url } =
        await api.github.oauthUrl();

      if (!url) {
        throw new Error(
          'GitHub authorization is not available.',
        );
      }

      window.location.href = url;
    } catch (error) {
      setConnectingGithub(false);

      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not connect GitHub',
      );
    }
  }

  /*
   * Status is still loading.
   *
   * Do not flash either the beginner card or the
   * experienced integrations page.
   */
  if (githubConnected === null) {
    return null;
  }

  /*
   * Beginner experience.
   *
   * Until GitHub is connected, no Vercel, Supabase,
   * publishing, custom keys, or integration catalogue.
   */
  if (!githubConnected) {
    return (
      <SettingsStack>
        <SettingsPanelHeader
          title="Start with GitHub"
          description="Connect once so Xroga can create, save, and update your projects."
        />

        <div className="glass-panel rounded-token-lg p-6 text-center sm:p-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-token-lg bg-[var(--surface-inset)]">
            <IntegrationLogo
              id="github"
              name="GitHub"
              size={30}
            />
          </div>

          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Connect GitHub to start building
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--text-secondary)]">
            Xroga uses GitHub behind the
            scenes to save your project and
            keep every update organized.
          </p>

          <button
            type="button"
            onClick={() =>
              void connectGithub()
            }
            disabled={connectingGithub}
            className="mt-6 rounded-token-sm bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-[var(--foreground)] transition-opacity disabled:opacity-60"
          >
            {connectingGithub
              ? 'Connecting GitHub…'
              : 'Connect GitHub'}
          </button>

          <p className="mt-3 text-xs text-[var(--text-muted)]">
            You can connect deployment,
            database, and other services
            later.
          </p>
        </div>
      </SettingsStack>
    );
  }

  /*
   * GitHub connected.
   *
   * Existing full integration management becomes visible.
   */
  return (
    <SettingsStack>
      <SettingsPanelHeader
        title="Integrations"
        description="GitHub is connected. Add deployment, database, publishing, and other services when your project needs them."
        action={
          <Badge
            tone="accent"
            dot
          >
            {
              CONNECTABLE_INTEGRATION_IDS.size
            }{' '}
            live
          </Badge>
        }
      />

      {/* Main shipping/deployment setup */}
      <ConnectShipWizard />

      {/* Publishing platform setup */}
      <UserOwnedPublishPanel compact />

      <SettingsDivider label="Optional" />

      {/* Optional product-service integrations */}
      <ConnectedServicesSection />

      {/* Custom credentials and webhooks */}
      <CustomCredentialsSection />

      <SettingsDivider label="Coming soon" />

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
          aria-hidden="true"
        />

        <input
          value={search}
          onChange={(event) =>
            setSearch(
              event.target.value,
            )
          }
          placeholder="Search the coming-soon catalogue…"
          className="w-full rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-inset)] py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        />
      </div>

      {noResults ? (
        <IntegrationRequestBanner
          query={search.trim()}
        />
      ) : null}

      <div className="glass-panel overflow-hidden rounded-token-lg">
        <button
          type="button"
          onClick={() =>
            setComingSoonOpen(
              (current) =>
                !current,
            )
          }
          aria-expanded={comingSoonOpen}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[var(--surface-inset)]"
        >
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Coming soon
            </h3>

            <p className="text-xs text-[var(--text-secondary)]">
              {comingSoon.length}{' '}
              wishlist integrations — not
              live OAuth yet
            </p>
          </div>

          <ChevronDown
            aria-hidden="true"
            className={cn(
              'h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform',
              comingSoonOpen &&
                'rotate-180',
            )}
          />
        </button>

        {comingSoonOpen ? (
          <div className="max-h-72 divide-y divide-[var(--border-subtle)] overflow-y-auto border-t border-[var(--border-subtle)]">
            {comingSoon.map(
              (item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 opacity-80"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-token-sm bg-[var(--surface-inset)] text-xs font-bold">
                      {item.name.charAt(0)}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                        {item.name}
                      </p>

                      <p className="truncate text-[10px] text-[var(--text-muted)]">
                        {item.category}
                      </p>
                    </div>
                  </div>

                  <Badge
                    tone="neutral"
                    className="shrink-0"
                  >
                    Coming soon
                  </Badge>
                </div>
              ),
            )}
          </div>
        ) : null}
      </div>
    </SettingsStack>
  );
}
