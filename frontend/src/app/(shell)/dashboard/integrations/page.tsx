import { Suspense } from 'react';
import { IntegrationsPanel } from '@/components/integrations/IntegrationsPanel';

export default function IntegrationsPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <Suspense fallback={<div className="animate-pulse h-48 bg-white/5 rounded-xl" />}>
        <IntegrationsPanel />
      </Suspense>
    </div>
  );
}
