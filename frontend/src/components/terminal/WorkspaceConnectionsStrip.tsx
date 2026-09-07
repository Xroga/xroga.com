'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, KeyRound, PlugZap } from 'lucide-react';
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
        <span className="xv-workspace-connections__mark" aria-hidden="true"><PlugZap /></span>
        <button type="button" className="xv-workspace-connections__copy" onClick={openConnections}>
          <strong>Connections</strong>
          <small>Use only what this build needs</small>
        </button>
        <div className="xv-workspace-connections__tabs" role="list" aria-label="Available connections">
          {CONNECTIONS.map((connection) => (
            <button key={connection.id} type="button" role="listitem" onClick={openConnections} aria-label={connected[connection.id] ? `${connection.name} connected; manage connection` : `Connect ${connection.name}`}>
              <IntegrationLogo id={connection.id} name={connection.name} size={13} />
              <b>{connection.name}</b>
              {connected[connection.id] ? <CheckCircle2 className="xv-workspace-connections__verified" aria-hidden="true" /> : null}
            </button>
          ))}
          <button type="button" role="listitem" onClick={openConnections} aria-label="Manage optional AI key">
            <KeyRound aria-hidden="true" />
            <b>AI key</b>
          </button>
        </div>
        <button type="button" className="xv-workspace-connections__manage" onClick={openConnections}>Manage</button>
      </section>
      {interactive ? <IntegrationsModal open={modalOpen} onClose={() => setModalOpen(false)} /> : null}
    </>
  );
}
