import { PricingPageClient } from '@/components/pricing/PricingPageClient';
import { PageJsonLd } from '@/components/seo/PageJsonLd';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Xroga Pricing — Free & Pro ($25/month)',
  description:
    'Compare Xroga Free and Pro. Start at $0, or get Xroga Pro for $25/month with higher AI capacity for chat, research, app building, coding, connected workflows and verification.',
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
        description="Compare Xroga Free and Xroga Pro at $25/month across chat, research, coding, building, GitHub, connected workflows, files, permissions and AI capacity."
      />
      <PricingPageClient />
    </>
  );
}
