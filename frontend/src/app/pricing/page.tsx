import { PricingPageClient } from '@/components/pricing/PricingPageClient';
import { buildMetadata } from '@/lib/seo';
import { PageJsonLd } from '@/components/seo/PageJsonLd';

export const metadata = buildMetadata({
  title: 'Pricing — One Xroga AI Plan',
  description:
    'Xroga AI is $19 per 30-day billing period. Activate by 30 August 2026 for one complete 30-day period free, with no card and no automatic charge.',
  path: '/pricing',
  keywords: [
    'Xroga pricing',
    'Xroga AI plan',
    '30-day Xroga promotion',
    'AI product builder pricing',
  ],
});

export default function PricingPage() {
  return <><PageJsonLd path="/pricing" name="XROGA AI pricing" description="XROGA AI plan, billing period, current capacity, and eligibility information." /><PricingPageClient /></>;
}
