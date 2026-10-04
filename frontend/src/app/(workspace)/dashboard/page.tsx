import { DashboardHomeView } from '@/components/dashboard/DashboardHomeView';
import { DashboardErrorBoundary } from '@/components/dashboard/DashboardErrorBoundary';
import { PAGE_SEO } from '@/lib/dashboard-metadata';

export const metadata = PAGE_SEO.dashboardHome;

export default function DashboardPage() {
  return (
    <DashboardErrorBoundary>
      <DashboardHomeView />
    </DashboardErrorBoundary>
  );
}
