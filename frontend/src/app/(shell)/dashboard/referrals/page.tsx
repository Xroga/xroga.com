import { ComingSoonPanel } from '@/components/dashboard/ComingSoonPanel';
import { PAGE_SEO } from '@/lib/dashboard-metadata';

export const metadata = PAGE_SEO.referrals;

export default function ReferralsPage() {
  return (
    <ComingSoonPanel
      title="Referrals"
      description="Referral rewards, token bonuses, and XRG earn paths are retired from the live product surface."
      backHref="/dashboard"
      backLabel="Back to Dashboard"
    />
  );
}
