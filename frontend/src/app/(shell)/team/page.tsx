import type { Metadata } from 'next';
import { TeamPage } from '@/components/team/TeamPage';

export const metadata: Metadata = {
  title: 'Team | Xroga',
  description: 'Invite people to your Xroga team with in-app invitations or a link you share yourself.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <TeamPage />;
}
