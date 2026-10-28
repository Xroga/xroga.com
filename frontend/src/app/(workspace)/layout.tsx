import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/AppShell';
import { AppProviders } from '@/components/providers/AppProviders';
import { UserCacheScopeBootstrap } from '@/components/bootstrap/UserCacheScopeBootstrap';
import { WorkspaceIdentityProvider } from '@/components/layout/WorkspaceIdentityContext';
import { normalizeOnboarding, shouldRouteToOnboarding } from '@/lib/onboarding';
import { resolveUserDisplayName } from '@/lib/userDisplayName';

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

  const setup = user ? await supabase.rpc('read_current_profile_setup') : { data: null, error: null };
  if (setup.error || (setup.data && setup.data.id !== user?.id)) throw new Error('Profile setup unavailable');
  const profile = setup.data;

  if (user) {
    const phone = await supabase.rpc('has_current_contact_phone');
    if (phone.error) throw new Error('Contact setup unavailable');
    if (!phone.data) redirect('/auth/contact?next=%2Fworkspace');
    if (profile && shouldRouteToOnboarding(normalizeOnboarding(profile.onboarding))) {
      redirect('/onboarding');
    }
  }

  const displayName = resolveUserDisplayName(user, profile?.display_name, 'Guest');
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
