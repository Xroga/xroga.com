import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/AppShell';
import { AppProviders } from '@/components/providers/AppProviders';
import { OnboardingGuard } from '@/components/onboarding/OnboardingGuard';

export default async function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();

  const displayName = profile?.display_name ?? user.email?.split('@')[0] ?? 'there';

  return (
    <AppProviders>
      <OnboardingGuard>
        <AppShell displayName={displayName}>{children}</AppShell>
      </OnboardingGuard>
    </AppProviders>
  );
}
