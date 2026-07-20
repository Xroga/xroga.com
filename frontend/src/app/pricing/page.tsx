import { PricingPageClient } from '@/components/pricing/PricingPageClient';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Pricing — AI Token Plans & Galactic Tiers',
  description:
    'Xroga AI pricing: pay for tokens, not features. Free trial ~0.55M tokens. Spark 6.17M tokens/mo, Pulse 9.42M (most popular), Nova 15.9M, Zenith 32.2M, Singularity 325M. All features on every plan.',
  path: '/pricing',
  keywords: [
    'Xroga pricing',
    'AI token plans',
    'Pulse plan',
    'Spark plan',
    'roga pricing',
    'droga ai cost',
    'top up tokens',
    '6.17M tokens',
  ],
});

export default function PricingPage() {
  return <PricingPageClient />;
}
