import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/AppShell';
import { AppProviders } from '@/components/providers/AppProviders';
import type { Metadata } from 'next';
import { UserCacheScopeBootstrap } from '@/components/bootstrap/UserCacheScopeBootstrap';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const displayName = user.email?.split('@')[0] ?? 'there';

  return (
    <>
      <UserCacheScopeBootstrap userId={user.id} />
      <AppProviders>
        <AppShell displayName={displayName} email={user.email ?? undefined}>{children}</AppShell>
      </AppProviders>
    </>
  );
}
