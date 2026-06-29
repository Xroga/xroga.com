import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AdminPageClient from './AdminPageClient';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? 'ceo@xroga.com,admin@xroga.com')
  .split(',')
  .map((e) => e.trim().toLowerCase());

export const metadata = {
  title: 'Admin — XROGA',
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const isAdmin =
    profile?.role === 'admin' ||
    (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase()));

  if (!isAdmin) redirect('/dashboard');

  return <AdminPageClient />;
}
