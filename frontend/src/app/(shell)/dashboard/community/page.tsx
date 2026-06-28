import { CommunityComingSoon } from '@/components/dashboard/CommunityComingSoon';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Xroga Community — Share & Discover Creations',
  description:
    'Coming soon: browse websites, apps, games, 3D models, and media from Xroga builders. Vote, comment, and collaborate.',
  path: '/dashboard/community',
});

export default function CommunityPage() {
  return <CommunityComingSoon />;
}
