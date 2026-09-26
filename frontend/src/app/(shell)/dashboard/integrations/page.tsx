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
            <div className="space-y-4" aria-label="Loading Plugins">
              <div className="h-8 w-32 animate-pulse rounded bg-[var(--surface-inset)]" />
              <div className="h-12 animate-pulse rounded-token-lg bg-[var(--surface-inset)]" />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map((item) => (
                  <div
                    key={item}
                    className="h-[142px] animate-pulse rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]"
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
