import { DashboardHomeView } from '@/components/dashboard/DashboardHomeView';
import { PAGE_SEO } from '@/lib/dashboard-metadata';

export const metadata = PAGE_SEO.dashboardHome;

export default function DashboardHomePage() {
  return <DashboardHomeView />;
}
