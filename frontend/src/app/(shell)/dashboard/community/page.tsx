import { Suspense } from 'react';
import { CommunityView } from '@/components/dashboard/CommunityView';
import { PAGE_SEO } from '@/lib/dashboard-metadata';
import Skeleton from 'react-loading-skeleton';

export const metadata = PAGE_SEO.community;

function CommunityFallback() {
  return (
    <div className="max-w-4xl mx-auto space-y-4 p-4">
      <Skeleton height={40} width={280} baseColor="#1a1a2e" highlightColor="#2a2a3e" />
      <Skeleton height={220} baseColor="#1a1a2e" highlightColor="#2a2a3e" />
    </div>
  );
}

export default function CommunityPage() {
  return (
    <Suspense fallback={<CommunityFallback />}>
      <CommunityView />
    </Suspense>
  );
}
