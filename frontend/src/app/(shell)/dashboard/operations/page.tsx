import type { Metadata } from 'next';
import { unstable_noStore as noStore } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import OperationsCentreClient from './OperationsCentreClient';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const metadata: Metadata = { title: 'Product Operations Centre | Xroga', robots: { index: false, follow: false, noarchive: true } };

export default async function OperationsCentrePage() {
  noStore();
  const supabase = await createClient().catch(() => null);
  if (!supabase) redirect('/auth/login');
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect('/auth/login');
  return <OperationsCentreClient />;
}
