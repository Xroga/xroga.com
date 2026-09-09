import { PricingPageClient } from '@/components/pricing/PricingPageClient';
import { buildMetadata } from '@/lib/seo';
import { PageJsonLd } from '@/components/seo/PageJsonLd';

export const metadata = buildMetadata({
  title: 'Pricing — One Xroga AI Plan',
  description:
    'Xroga AI is $25 per month with all product-building features included.',
  path: '/pricing',
  keywords: [
    'Xroga pricing',
    'Xroga AI plan',
    'Xroga monthly plan',
    'AI product builder pricing',
  ],
});

export default function PricingPage() {
  return (
    <>
      <PageJsonLd
        path="/pricing"
        name="XROGA AI pricing"
        description="XROGA AI offers one $25 monthly plan for building, verifying, and publishing software."
      />

      <PricingPageClient />
    </>
  );
}
