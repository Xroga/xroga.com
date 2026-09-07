'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { IntegrationLogo } from '@/components/integrations/IntegrationLogo';
import { IntegrationsModal } from '@/components/terminal/IntegrationsModal';
import { api } from '@/lib/api';

const CONNECTIONS = [
  { id: 'github', name: 'GitHub' },
  { id: 'vercel', name: 'Vercel' },
  { id: 'supabase', name: 'Supabase' },
] as const;

export function WorkspaceConnectionsStrip({ href, interactive = false }: { href: string; interactive?: boolean }) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [connected, setConnected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!interactive) return;
    let active = true;
    void Promise.allSettled([api.github.status(), api.vercel.status(), api.supabase.status()]).then((results) => {
      if (!active) return;
      setConnected({
        github: results[0].status === 'fulfilled' && results[0].value.connected,
        vercel: results[1].status === 'fulfilled' && results[1].value.connected,
        supabase: results[2].status === 'fulfilled' && results[2].value.connected,
      });
    });
    return () => { active = false; };
  }, [interactive]);

  const openConnections = () => {
    if (interactive) setModalOpen(true);
    else router.push(href);
  };

  return (
    <>
      <section className="xv-workspace-connections" aria-label="Build connections">
        <button type="button" className="xv-workspace-connections__trigger" onClick={openConnections} aria-describedby="workspace-integrations-preview">
          <span className="xv-workspace-connections__logo" aria-hidden="true">
            <IntegrationLogo id="github" name="GitHub" size={12} />
            <IntegrationLogo id="vercel" name="Vercel" size={12} />
            <IntegrationLogo id="supabase" name="Supabase" size={12} />
          </span>
          <strong>Integrations</strong>
          <ChevronRight aria-hidden="true" />
        </button>
        <div id="workspace-integrations-preview" className="xv-workspace-connections__preview" role="tooltip">
          <strong>Build connections</strong>
          {CONNECTIONS.map((connection) => (
            <span key={connection.id}>
              <IntegrationLogo id={connection.id} name={connection.name} size={13} />
              <b>{connection.name}</b>
              <i className={connected[connection.id] ? 'is-connected' : undefined}>{connected[connection.id] ? 'Connected' : 'Available'}</i>
            </span>
          ))}
          <small>Click to manage providers and AI keys.</small>
        </div>
      </section>
      {interactive ? <IntegrationsModal open={modalOpen} onClose={() => setModalOpen(false)} /> : null}
    </>
  );
}
