import type { Metadata } from 'next';
import { unstable_noStore as noStore } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { authorizeFounderRequest } from '@/lib/osFounderAccess';
import { FounderOperations } from '@/components/os-preview/FounderOperations';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const metadata: Metadata = { title: 'Founder Operations | Xroga', robots: { index: false, follow: false, noarchive: true } };

export default async function FounderOperationsPage() {
  noStore();
  const supabase = await createClient().catch(() => null);
  if (!supabase) redirect('/os-preview/access-denied');
  const decision = await authorizeFounderRequest({
    getUser: async () => {
      const { data, error } = await supabase.auth.getUser();
      return error ? null : data.user;
    },
    getRole: async () => {
      const { data, error } = await supabase.rpc('current_community_role');
      return error ? null : data;
    },
    getAal: async () => {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      return error ? null : data.currentLevel;
    },
  });
  if (!decision.allowed) redirect('/os-preview/access-denied');
  return <FounderOperations />;
}
