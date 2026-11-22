'use client';

import Link from 'next/link';
import { useWorkspaceIdentity } from '@/components/layout/WorkspaceIdentityContext';
import { TeamMembershipPanel, teamMembershipPreviewAvailable } from './TeamMembershipPanel';
import styles from './WorkspacePeopleControls.module.css';

export const TEAM_SETTINGS_PATH = '/settings/teams';

/** Shared presentation boundary; the API independently checks identity, plan and role. */
export function TeamMembershipAccess({ inDrawer = false }: { inDrawer?: boolean }) {
  const { status, userId } = useWorkspaceIdentity();

  if (!teamMembershipPreviewAvailable()) {
    return <section className={styles.teamSection}>
      <h2>Team membership</h2>
      <p>Team management is not enabled in this environment.</p>
    </section>;
  }

  if (status !== 'authenticated' || !userId) {
    const next = inDrawer ? '/workspace?teamInvites=1' : TEAM_SETTINGS_PATH;
    return <section className={styles.teamSection}>
      <h2>Sign in to manage teams</h2>
      <p>Use your own Xroga account to view your teams and invitations.</p>
      <Link href={`/auth/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
    </section>;
  }

  return <TeamMembershipPanel key={userId} userId={userId} />;
}
