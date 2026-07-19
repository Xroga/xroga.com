import { Suspense } from 'react';
import { UserOwnedPublishPanel } from '@/components/publish/UserOwnedPublishPanel';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';
import { PAGE_SEO } from '@/lib/dashboard-metadata';

export const metadata = PAGE_SEO.publish;

export default function PublishPage() {
  return (
    <PageFullscreenFrame>
      <div className="max-w-3xl mx-auto space-y-4">
        <Suspense fallback={<div className="animate-pulse h-48 bg-white/5 rounded-xl" />}>
          <UserOwnedPublishPanel />
        </Suspense>
      </div>
    </PageFullscreenFrame>
  );
}
