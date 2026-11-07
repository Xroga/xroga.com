import { DashboardView } from '@/components/dashboard/DashboardView';
import { DashboardErrorBoundary } from '@/components/dashboard/DashboardErrorBoundary';
import { PAGE_SEO } from '@/lib/dashboard-metadata';
import { createClient } from '@/lib/supabase/server';
import { responseV2Decision, responseV2Audience } from '@/components/response-experience-v2/access';
import { ResponseExperienceProvider } from '@/components/response-experience-v2/ResponseExperienceGate';

export const metadata = PAGE_SEO.dashboard;

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ responseV2?: string }> }) {
  const query = await searchParams;
  let authorizedUserId: string | null = null;
  let reviewStatus: string | null = null;
  const enabled = process.env.VERCEL_ENV === 'preview' || process.env.NODE_ENV === 'development' || process.env.RESPONSE_EXPERIENCE_V2 === 'founder';
  const rollout = process.env.RESPONSE_EXPERIENCE_V2;
  if (rollout === 'authenticated' || rollout === 'canary' || (enabled && query.responseV2 === '1')) {
    try {
      const client = await createClient();
      const { data: { user } } = await client.auth.getUser();
      if (responseV2Audience(rollout, user?.id ?? null, process.env.RESPONSE_EXPERIENCE_V2_USERS)) {
        authorizedUserId = user!.id;
      } else if (enabled && query.responseV2 === '1') {
      const decision = await responseV2Decision(enabled, true, {
        getUser: async () => user,
        getRole: async () => { const { data, error } = await client.rpc('current_community_role'); return error ? null : data; },
        getAal: async () => { const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel(); return error ? null : data.currentLevel; },
      });
      if (decision.allowed) authorizedUserId = user?.id ?? null;
      else reviewStatus = `V2 review unavailable: ${decision.reason}. The original response experience remains active.`;
      }
    } catch { reviewStatus = 'V2 review could not verify this session. The original response experience remains active.'; }
  }
  return (
    <DashboardErrorBoundary>
      {reviewStatus && <p role="status">{reviewStatus}</p>}
      <ResponseExperienceProvider authorizedUserId={authorizedUserId}><DashboardView /></ResponseExperienceProvider>
    </DashboardErrorBoundary>
  );
}
