import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, UsersRound } from 'lucide-react';
import { TeamMembershipAccess } from '@/components/terminal/TeamMembershipAccess';
import styles from '@/components/terminal/WorkspacePeopleControls.module.css';

export const metadata: Metadata = {
  title: 'Team settings | XROGA AI',
  robots: { index: false, follow: false },
};

export default function TeamSettingsPage() {
  return <div className={styles.settingsPage}>
    <Link href="/workspace" className={styles.backLink}><ArrowLeft size={16} aria-hidden="true" /> Back to Workspace</Link>
    <header className={styles.settingsIntro}>
      <UsersRound size={24} aria-hidden="true" />
      <h1>Team settings</h1>
      <p>Create teams, select a team to manage, and review invitations. Membership does not share anyone’s subscription, personal conversations or connected accounts.</p>
    </header>
    <TeamMembershipAccess />
  </div>;
}
