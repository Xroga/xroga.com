import { InfluencerView } from '@/components/dashboard/InfluencerView';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';
import { PAGE_SEO } from '@/lib/dashboard-metadata';

export const metadata = PAGE_SEO.influencer;

export default function InfluencerPage() {
  return (
    <PageFullscreenFrame>
      <InfluencerView />
    </PageFullscreenFrame>
  );
}
