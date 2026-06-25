import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { SettingsView } from '@/components/settings/SettingsView';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <Suspense fallback={<div className="animate-pulse h-96 bg-white/5 rounded-xl" />}>
      <SettingsView email={user?.email ?? ''} />
    </Suspense>
  );
}
