import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/AppShell';
import { AppProviders } from '@/components/providers/AppProviders';
import { UserCacheScopeBootstrap } from '@/components/bootstrap/UserCacheScopeBootstrap';
import { WorkspaceIdentityProvider } from '@/components/layout/WorkspaceIdentityContext';
import { normalizeOnboarding, shouldRouteToOnboarding } from '@/lib/onboarding';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding')
      .eq('id', user.id)
      .single();

    if (profile && shouldRouteToOnboarding(normalizeOnboarding(profile.onboarding))) {
      redirect('/onboarding');
    }
  }

  const displayName = user?.email?.split('@')[0] ?? 'Guest';
  const status = user ? 'authenticated' : 'guest';

  return (
    <>
      {/*
        Guest and account caches must never share an owner. This also prevents a
        signed-out visitor on a previously used browser from seeing the last user's
        local terminal/project data. Phase 4 can migrate guest data before ownership
        changes after signup.
      */}
      <UserCacheScopeBootstrap userId={user?.id ?? 'guest'} />
      <WorkspaceIdentityProvider
        status={status}
        userId={user?.id}
        displayName={displayName}
        email={user?.email ?? undefined}
      >
        <AppProviders>
          <AppShell
            displayName={user ? displayName : undefined}
            email={user?.email ?? undefined}
          >
            {children}
          </AppShell>
        </AppProviders>
      </WorkspaceIdentityProvider>
    </>
  );
}
