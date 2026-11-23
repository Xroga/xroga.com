import type { Metadata } from 'next';
import { JoinTeam } from '@/components/team/JoinTeam';

// A bearer token is in the URL, so keep it out of search engines and referrers.
export const metadata: Metadata = {
  title: 'Team invitation | Xroga',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <JoinTeam token={token} />;
}
