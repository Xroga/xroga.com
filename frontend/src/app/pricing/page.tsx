import { PricingPageClient } from '@/components/pricing/PricingPageClient';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Pricing — Top Up Actions & Galactic Plans',
  description:
    'Xroga AI pricing: pay for Swarm fuel, not features. Spark 1,500 actions/mo, Pulse 5,000 (most popular), Nova 10,000. All 92 features on every plan. Budget tiers from $6/mo coming soon.',
  path: '/pricing',
  keywords: [
    'Xroga pricing',
    'AI action credits',
    'Pulse plan',
    'Spark plan',
    'roga pricing',
    'droga ai cost',
    'top up actions',
  ],
});

export default function PricingPage() {
  return <PricingPageClient />;
}
