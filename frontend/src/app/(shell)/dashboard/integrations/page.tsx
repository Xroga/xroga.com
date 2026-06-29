import { Suspense } from 'react';
import { IntegrationsPanel } from '@/components/integrations/IntegrationsPanel';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';
import { PAGE_SEO } from '@/lib/dashboard-metadata';

export const metadata = PAGE_SEO.integrations;

export default function IntegrationsPage() {
  return (
    <PageFullscreenFrame>
      <div className="max-w-4xl mx-auto">
        <Suspense fallback={<div className="animate-pulse h-48 bg-white/5 rounded-xl" />}>
          <IntegrationsPanel />
        </Suspense>
      </div>
    </PageFullscreenFrame>
  );
}
