import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { SettingsView } from '@/components/settings/SettingsView';
import { PAGE_SEO } from '@/lib/dashboard-metadata';

export const metadata = PAGE_SEO.settings;

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <Suspense fallback={<div className="animate-pulse h-96 bg-white/5 rounded-xl" />}>
      <SettingsView email={user?.email ?? ''} />
    </Suspense>
  );
}
