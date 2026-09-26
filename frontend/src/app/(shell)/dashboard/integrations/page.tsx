import { Suspense } from 'react';
import { IntegrationsPanel } from '@/components/integrations/IntegrationsPanel';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';
import { PAGE_SEO } from '@/lib/dashboard-metadata';

export const metadata = PAGE_SEO.integrations;

export default function IntegrationsPage() {
  return (
    <PageFullscreenFrame>
      <div className="mx-auto w-full max-w-7xl">
        <Suspense
          fallback={
            <div className="space-y-4">
              <div className="h-8 w-40 animate-pulse rounded bg-[var(--surface-inset)]" />
              <div className="h-12 animate-pulse rounded-token-lg bg-[var(--surface-inset)]" />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-36 animate-pulse rounded-token-lg bg-[var(--surface-inset)]"
                  />
                ))}
              </div>
            </div>
          }
        >
          <IntegrationsPanel />
        </Suspense>
      </div>
    </PageFullscreenFrame>
  );
}
