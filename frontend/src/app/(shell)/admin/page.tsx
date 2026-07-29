import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AdminPageClient from './AdminPageClient';

export const metadata = {
  title: 'Admin — XROGA',
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: role } = await supabase.rpc('current_community_role');
  const isAdmin = role === 'admin' || role === 'owner';

  if (!isAdmin) redirect('/dashboard');

  return <AdminPageClient />;
}
