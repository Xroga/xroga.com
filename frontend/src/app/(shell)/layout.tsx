import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/AppShell';
import { AppProviders } from '@/components/providers/AppProviders';
import type { Metadata } from 'next';
import { UserCacheScopeBootstrap } from '@/components/bootstrap/UserCacheScopeBootstrap';
import { normalizeOnboarding, shouldRouteToOnboarding } from '@/lib/onboarding';
import { WorkspaceIdentityProvider } from '@/components/layout/WorkspaceIdentityContext';
import { resolveUserDisplayName } from '@/lib/userDisplayName';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  /*
   * A signed-in account that has not finished setup is sent to finish it, so
   * onboarding is not something only a fresh signup can ever see — someone who
   * closed the tab halfway through lands back where they left off.
   *
   * It is not a gate on every login. `shouldRouteToOnboarding` is true only for
   * `not_started` and `in_progress`; skipping records a decision and is respected.
   * Accounts that predate the feature were marked complete by the migration, so
   * this does not sweep the existing userbase into a flow meant for new signups.
   *
   * A missing row means the profile has not been provisioned yet, which is its own
   * problem and not one onboarding should turn into a redirect loop — the shell
   * renders and the account is left alone.
   */
  const profile = user
    ? (await supabase
      .from('profiles')
      .select('onboarding, display_name')
      .eq('id', user.id)
      .single()).data
    : null;

  if (user && profile && shouldRouteToOnboarding(normalizeOnboarding(profile.onboarding))) {
    redirect('/onboarding');
  }

  const displayName = resolveUserDisplayName(user, profile?.display_name, 'Guest');
  const status = user ? 'authenticated' : 'guest';

  return (
    <>
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
