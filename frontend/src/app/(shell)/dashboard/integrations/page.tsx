import { Suspense } from 'react';
import { GitHubConnect } from '@/components/integrations/GitHubConnect';

export default function IntegrationsPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Integrations</h1>
      <p className="text-sm text-[var(--muted)]">Connect external services to power your Swarm.</p>
      <Suspense fallback={<div className="animate-pulse h-48 bg-white/5 rounded-xl" />}>
        <GitHubConnect />
      </Suspense>
    </div>
  );
}
