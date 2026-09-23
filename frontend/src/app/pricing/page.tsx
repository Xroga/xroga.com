import { PricingPageClient } from '@/components/pricing/PricingPageClient';
import { PageJsonLd } from '@/components/seo/PageJsonLd';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Xroga Pricing — Free & Pro ($25/month)',
  description:
    'Start Xroga for $0 with no card. Upgrade to Xroga Pro for $25/month for higher monthly AI capacity, Full Access pacing, repository-aware coding, browser verification, and production-focused workflows.',
  path: '/pricing',
  keywords: [
    'Xroga pricing',
    'Xroga AI pricing',
    'Xroga Pro',
    'AI app builder pricing',
    'AI coding agent pricing',
    'AI software builder pricing',
    'vibe coding pricing',
    'AI developer agent pricing',
  ],
});

export default function PricingPage() {
  return (
    <>
      <PageJsonLd
        path="/pricing"
        name="Xroga pricing — Free and Xroga Pro"
        description="Xroga Free is $0 with no card required. Xroga Pro is $25/month with higher monthly AI capacity, Full Access pacing, and more room for production-focused software workflows."
      />
      <PricingPageClient />
    </>
  );
}
