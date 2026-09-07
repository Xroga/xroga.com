'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

import { IntegrationLogo } from '@/components/integrations/IntegrationLogo';
import { IntegrationsModal } from '@/components/terminal/IntegrationsModal';
import { api } from '@/lib/api';

const CONNECTIONS = [
  { id: 'github', name: 'GitHub' },
  { id: 'vercel', name: 'Vercel' },
  { id: 'supabase', name: 'Supabase' },
] as const;

interface WorkspaceConnectionsStripProps {
  href: string;
  interactive?: boolean;
}

export function WorkspaceConnectionsStrip({
  href,
  interactive = false,
}: WorkspaceConnectionsStripProps) {
  const router = useRouter();

  const [modalOpen, setModalOpen] = useState(false);
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [checking, setChecking] = useState(interactive);
  const [connectingGithub, setConnectingGithub] = useState(false);

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
          Boolean(results[0].value.connected),

        vercel:
          results[1].status === 'fulfilled' &&
          Boolean(results[1].value.connected),

        supabase:
          results[2].status === 'fulfilled' &&
          Boolean(results[2].value.connected),
      });

      setChecking(false);
    });

    return () => {
      active = false;
    };
  }, [interactive]);

  const githubConnected = connected.github === true;

  async function connectGithub() {
    if (connectingGithub) return;

    setConnectingGithub(true);

    try {
      const { url } = await api.github.oauthUrl();

      if (!url) {
        throw new Error('GitHub authorization is not available.');
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

  function openConnections() {
    if (interactive) {
      setModalOpen(true);
      return;
    }

    router.push(href);
  }

  /*
   * Avoid flashing the experienced-user Integrations state
   * before GitHub status is known.
   */
  if (interactive && checking) {
    return null;
  }

  /*
   * Beginner state:
   *
   * Until GitHub is connected, show one clear action only.
   * Do not expose Vercel, Supabase, provider keys, etc.
   */
  if (interactive && !githubConnected) {
    return (
      <section
        className="xv-workspace-connections"
        aria-label="Connect GitHub to start"
      >
        <button
          type="button"
          className="xv-workspace-connections__trigger"
          onClick={() => void connectGithub()}
          disabled={connectingGithub}
          aria-busy={connectingGithub}
        >
          <span
            className="xv-workspace-connections__logo"
            aria-hidden="true"
          >
            <IntegrationLogo
              id="github"
              name="GitHub"
              size={14}
            />
          </span>

          <strong>
            {connectingGithub
              ? 'Connecting GitHub…'
              : 'Connect GitHub to start'}
          </strong>

          <ChevronRight aria-hidden="true" />
        </button>
      </section>
    );
  }

  /*
   * Connected / experienced state.
   *
   * Non-interactive marketing/demo usage also keeps the
   * familiar integrations presentation.
   */
  return (
    <>
      <section
        className="xv-workspace-connections"
        aria-label="Build connections"
      >
        <button
          type="button"
          className="xv-workspace-connections__trigger"
          onClick={openConnections}
          aria-describedby="workspace-integrations-preview"
        >
          <span
            className="xv-workspace-connections__logo"
            aria-hidden="true"
          >
            <IntegrationLogo
              id="github"
              name="GitHub"
              size={12}
            />

            <IntegrationLogo
              id="vercel"
              name="Vercel"
              size={12}
            />

            <IntegrationLogo
              id="supabase"
              name="Supabase"
              size={12}
            />
          </span>

          <strong>Integrations</strong>

          <ChevronRight aria-hidden="true" />
        </button>

        <div
          id="workspace-integrations-preview"
          className="xv-workspace-connections__preview"
          role="tooltip"
        >
          <strong>Build connections</strong>

          {CONNECTIONS.map((connection) => {
            const isConnected =
              connected[connection.id] === true;

            return (
              <span key={connection.id}>
                <IntegrationLogo
                  id={connection.id}
                  name={connection.name}
                  size={13}
                />

                <b>{connection.name}</b>

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
          })}

          <small>
            Click to manage integrations.
          </small>
        </div>
      </section>

      {interactive ? (
        <IntegrationsModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
        />
      ) : null}
    </>
  );
}
