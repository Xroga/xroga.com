import { DashboardView } from '@/components/dashboard/DashboardView';
import { DashboardErrorBoundary } from '@/components/dashboard/DashboardErrorBoundary';
import { PAGE_SEO } from '@/lib/dashboard-metadata';
import { createClient } from '@/lib/supabase/server';
import { responseV2Access } from '@/components/response-experience-v2/access';
import { ResponseExperienceProvider } from '@/components/response-experience-v2/ResponseExperienceGate';

export const metadata = PAGE_SEO.dashboard;

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ responseV2?: string }> }) {
  const query = await searchParams;
  let founderId: string | null = null;
  const enabled = process.env.VERCEL_ENV === 'preview' || process.env.NODE_ENV === 'development' || process.env.RESPONSE_EXPERIENCE_V2 === 'founder';
  if (enabled && query.responseV2 === '1') {
    try {
      const client = await createClient();
      const { data: { user } } = await client.auth.getUser();
      if (await responseV2Access(enabled, true, {
        getUser: async () => user,
        getRole: async () => { const { data, error } = await client.rpc('current_community_role'); return error ? null : data; },
        getAal: async () => { const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel(); return error ? null : data.currentLevel; },
      })) founderId = user?.id ?? null;
    } catch { /* Fail closed to the original Workspace. */ }
  }
  return (
    <DashboardErrorBoundary>
      <ResponseExperienceProvider founderId={founderId}><DashboardView /></ResponseExperienceProvider>
    </DashboardErrorBoundary>
  );
}
