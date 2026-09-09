import { PricingPageClient } from '@/components/pricing/PricingPageClient';
import { buildMetadata } from '@/lib/seo';
import { PageJsonLd } from '@/components/seo/PageJsonLd';

export const metadata = buildMetadata({
  title: 'Pricing — Free and Xroga Pro',
  description:
    'Start with Xroga Free at $0 with no card, or upgrade to Xroga Pro for $25/month.',
  path: '/pricing',
  keywords: [
    'Xroga pricing',
    'Xroga AI plan',
    'Xroga Pro pricing',
    'AI product builder pricing',
  ],
});

export default function PricingPage() {
  return <><PageJsonLd path="/pricing" name="XROGA AI pricing" description="Xroga Free and Xroga Pro plans, current capacity, and billing information." /><PricingPageClient /></>;
}
