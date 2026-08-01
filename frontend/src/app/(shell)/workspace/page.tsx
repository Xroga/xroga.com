import { DashboardView } from '@/components/dashboard/DashboardView';
import { DashboardErrorBoundary } from '@/components/dashboard/DashboardErrorBoundary';
import { PAGE_SEO } from '@/lib/dashboard-metadata';

export const metadata = PAGE_SEO.dashboard;

export default function WorkspacePage() {
  return (
    <DashboardErrorBoundary>
      <DashboardView />
    </DashboardErrorBoundary>
  );
}
