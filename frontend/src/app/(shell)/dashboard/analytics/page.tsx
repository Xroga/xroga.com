import { AnalyticsView } from '@/components/dashboard/AnalyticsView';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';
import { PAGE_SEO } from '@/lib/dashboard-metadata';

export const metadata = PAGE_SEO.analytics;

export default function AnalyticsPage() {
  return (
    <PageFullscreenFrame>
      <AnalyticsView />
    </PageFullscreenFrame>
  );
}
