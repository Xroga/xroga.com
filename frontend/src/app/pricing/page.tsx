import { PricingPageClient } from '@/components/pricing/PricingPageClient';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Pricing — AI Token Plans & Galactic Tiers',
  description:
    'Xroga AI pricing: pay for tokens, not features. Spark 7M tokens/mo, Pulse 12M (most popular), Nova 20M, Zenith 35M, Singularity 100M. All 98 features on every plan.',
  path: '/pricing',
  keywords: [
    'Xroga pricing',
    'AI token plans',
    'Pulse plan',
    'Spark plan',
    'roga pricing',
    'droga ai cost',
    'top up tokens',
    '7M free tokens',
  ],
});

export default function PricingPage() {
  return <PricingPageClient />;
}
