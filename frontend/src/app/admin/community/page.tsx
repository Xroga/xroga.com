import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CommunityAdminDashboard } from '@/components/community/CommunityAdminDashboard';
import { createClient } from '@/lib/supabase/server';
import type { CommunityRole } from '@/lib/community';

export const metadata: Metadata = { title: 'Community Admin — Xroga', robots: { index: false, follow: false } };

export default async function CommunityAdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?next=%2Fadmin%2Fcommunity');
  const { data } = await supabase.rpc('current_community_role');
  const role = (typeof data === 'string' ? data : 'member') as CommunityRole;
  if (!['moderator', 'admin', 'owner'].includes(role)) {
    return <main className="grid min-h-screen place-items-center bg-slate-50 p-5 text-slate-950 dark:bg-[#060a0f] dark:text-white"><div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/[.04]"><p className="text-sm font-black uppercase tracking-widest text-red-500">403 · Access denied</p><h1 className="mt-3 text-3xl font-black">Community staff only</h1><p className="mt-3 text-sm leading-6 text-slate-500">Your account is signed in but does not have a moderator, administrator, or owner role.</p><Link href="/community" className="mt-5 inline-block rounded-xl bg-[#006aff] px-5 py-2.5 font-bold text-white">Return to community</Link></div></main>;
  }
  return <CommunityAdminDashboard role={role} />;
}
