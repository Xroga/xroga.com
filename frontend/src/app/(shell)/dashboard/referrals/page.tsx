import { ReferralView } from '@/components/dashboard/ReferralView';
import { PAGE_SEO } from '@/lib/dashboard-metadata';

export const metadata = PAGE_SEO.referrals;

export default function ReferralsPage() {
  return <ReferralView />;
}
