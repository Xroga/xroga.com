import { ComingSoonPanel } from '@/components/dashboard/ComingSoonPanel';
import { PAGE_SEO } from '@/lib/dashboard-metadata';

export const metadata = PAGE_SEO.analytics;

export default function AnalyticsPage() {
  return (
    <ComingSoonPanel
      title="Analytics & Insights"
      description="Platform analytics, token quotas, and legacy usage dashboards have been removed while we rebuild metering for the new AI system."
      backHref="/dashboard"
      backLabel="Back to Dashboard"
    />
  );
}
