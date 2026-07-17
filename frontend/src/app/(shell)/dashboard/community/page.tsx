import { CommunityComingSoon } from '@/components/dashboard/CommunityComingSoon';
import { PAGE_SEO } from '@/lib/dashboard-metadata';

export const metadata = PAGE_SEO.community;

export default function CommunityPage() {
  return <CommunityComingSoon />;
}