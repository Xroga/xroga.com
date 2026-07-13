import { createClient } from '@/lib/supabase/server';
import { DashboardHomeView } from '@/components/dashboard/DashboardHomeView';
import { DashboardErrorBoundary } from '@/components/dashboard/DashboardErrorBoundary';
import { PAGE_SEO } from '@/lib/dashboard-metadata';

export const metadata = PAGE_SEO.dashboardHome;

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  void user;

  return (
    <DashboardErrorBoundary>
      <DashboardHomeView />
    </DashboardErrorBoundary>
  );
}
