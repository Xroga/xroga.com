import Link from 'next/link';
import { KeyRound, PlugZap } from 'lucide-react';
import { IntegrationLogo } from '@/components/integrations/IntegrationLogo';

const CONNECTIONS = [
  { id: 'github', name: 'GitHub' },
  { id: 'vercel', name: 'Vercel' },
  { id: 'supabase', name: 'Supabase' },
] as const;

export function WorkspaceConnectionsStrip({ href }: { href: string }) {
  return (
    <section className="xv-workspace-connections" aria-label="Build connections">
      <span className="xv-workspace-connections__mark" aria-hidden="true"><PlugZap /></span>
      <span className="xv-workspace-connections__copy">
        <strong>Connections</strong>
        <small>Optional · add only what this build needs</small>
      </span>
      <div className="xv-workspace-connections__tabs" role="list" aria-label="Available connections">
        {CONNECTIONS.map((connection) => (
          <span key={connection.id} role="listitem">
            <IntegrationLogo id={connection.id} name={connection.name} size={13} />
            <b>{connection.name}</b>
          </span>
        ))}
        <span role="listitem">
          <KeyRound aria-hidden="true" />
          <b>AI key</b>
          <i>Optional</i>
        </span>
      </div>
      <Link href={href}>Manage</Link>
    </section>
  );
}
