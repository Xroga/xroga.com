'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

import { IntegrationLogo } from '@/components/integrations/IntegrationLogo';
import { IntegrationsModal } from '@/components/terminal/IntegrationsModal';
import { api } from '@/lib/api';

const CONNECTIONS = [
  {
    id: 'github',
    name: 'GitHub',
  },
  {
    id: 'vercel',
    name: 'Vercel',
  },
  {
    id: 'supabase',
    name: 'Supabase',
  },
] as const;

type WorkspaceConnectionsVariant =
  | 'default'
  | 'chatbar';

interface WorkspaceConnectionsStripProps {
  href: string;
  interactive?: boolean;
  variant?: WorkspaceConnectionsVariant;
}

export function WorkspaceConnectionsStrip({
  href,
  interactive = false,
  variant = 'default',
}: WorkspaceConnectionsStripProps) {
  const router = useRouter();

  const chatbar =
    variant === 'chatbar';

  const [modalOpen, setModalOpen] =
    useState(false);

  const [connected, setConnected] =
    useState<Record<string, boolean>>({});

  const [checking, setChecking] =
    useState(interactive);

  const [
    connectingGithub,
    setConnectingGithub,
  ] = useState(false);

  /* ============================================================
     CONNECTION STATUS
     ============================================================ */

  useEffect(() => {
    if (!interactive) {
      setChecking(false);
      return;
    }

    let active = true;

    setChecking(true);

    void Promise.allSettled([
      api.github.status(),
      api.vercel.status(),
      api.supabase.status(),
    ]).then((results) => {
      if (!active) return;

      setConnected({
        github:
          results[0].status === 'fulfilled' &&
          Boolean(
            results[0].value.connected,
          ),

        vercel:
          results[1].status === 'fulfilled' &&
          Boolean(
            results[1].value.connected,
          ),

        supabase:
          results[2].status === 'fulfilled' &&
          Boolean(
            results[2].value.connected,
          ),
      });

      setChecking(false);
    });

    return () => {
      active = false;
    };
  }, [interactive]);

  const githubConnected =
    connected.github === true;

  const rootClassName = [
    'xv-workspace-connections',
    chatbar
      ? 'xv-workspace-connections--chatbar'
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  /* ============================================================
     GITHUB CONNECT
     ============================================================ */

  async function connectGithub() {
    if (connectingGithub) return;

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

  /* ============================================================
     OPEN PLUGINS
     ============================================================ */

  function openConnections() {
    if (interactive) {
      setModalOpen(true);
      return;
    }

    router.push(href);
  }

  /* ============================================================
     LOADING
     ============================================================ */

  if (
    interactive &&
    checking
  ) {
    return null;
  }

  /* ============================================================
     GITHUB NOT CONNECTED
     ============================================================ */

  if (
    interactive &&
    !githubConnected
  ) {
    return (
      <section
        className={rootClassName}
        aria-label="Connect GitHub to start"
      >
        <button
          type="button"
          className="xv-workspace-connections__trigger"
          onClick={() =>
            void connectGithub()
          }
          disabled={
            connectingGithub
          }
          aria-busy={
            connectingGithub
          }
        >
          <span
            className="xv-workspace-connections__logo"
            aria-hidden="true"
          >
            <IntegrationLogo
              id="github"
              name="GitHub"
              size={
                chatbar
                  ? 18
                  : 14
              }
            />
          </span>

          <strong>
            {connectingGithub
              ? 'Connecting GitHub…'
              : chatbar
                ? 'Connect GitHub'
                : 'Connect GitHub to start'}
          </strong>

          {!chatbar ? (
            <ChevronRight
              aria-hidden="true"
            />
          ) : null}
        </button>
      </section>
    );
  }

  /* ============================================================
     CONNECTED / PLUGINS STATE
     ============================================================ */

  return (
    <>
      <section
        className={rootClassName}
        aria-label="Plugins"
      >
        <button
          type="button"
          className="xv-workspace-connections__trigger"
          onClick={openConnections}
          aria-describedby="workspace-plugins-preview"
        >
          <span
            className="xv-workspace-connections__logo"
            aria-hidden="true"
          >
            <IntegrationLogo
              id="github"
              name="GitHub"
              size={
                chatbar
                  ? 17
                  : 12
              }
            />

            <IntegrationLogo
              id="vercel"
              name="Vercel"
              size={
                chatbar
                  ? 17
                  : 12
              }
            />

            <IntegrationLogo
              id="supabase"
              name="Supabase"
              size={
                chatbar
                  ? 17
                  : 12
              }
            />
          </span>

          <strong>
            Plugins
          </strong>

          {!chatbar ? (
            <ChevronRight
              aria-hidden="true"
            />
          ) : null}
        </button>

        {/* ====================================================
            HOVER PREVIEW
            ==================================================== */}

        <div
          id="workspace-plugins-preview"
          className="xv-workspace-connections__preview"
          role="tooltip"
        >
          <strong>
            Plugins
          </strong>

          {CONNECTIONS.map(
            (connection) => {
              const isConnected =
                connected[
                  connection.id
                ] === true;

              return (
                <span
                  key={
                    connection.id
                  }
                >
                  <IntegrationLogo
                    id={
                      connection.id
                    }
                    name={
                      connection.name
                    }
                    size={13}
                  />

                  <b>
                    {
                      connection.name
                    }
                  </b>

                  <i
                    className={
                      isConnected
                        ? 'is-connected'
                        : undefined
                    }
                  >
                    {isConnected
                      ? 'Connected'
                      : 'Available'}
                  </i>
                </span>
              );
            },
          )}

          <small>
            Click to manage plugins.
          </small>
        </div>
      </section>

      {/* ======================================================
          PLUGINS MODAL
          ====================================================== */}

      {interactive ? (
        <IntegrationsModal
          open={modalOpen}
          onClose={() =>
            setModalOpen(false)
          }
        />
      ) : null}
    </>
  );
}
