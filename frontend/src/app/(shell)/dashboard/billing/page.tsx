import { BillingPageClient } from '@/components/billing/BillingPageClient';
import { PAGE_SEO } from '@/lib/dashboard-metadata';

export const metadata = PAGE_SEO.billing;

export default function BillingPage() {
  return <BillingPageClient />;
}
