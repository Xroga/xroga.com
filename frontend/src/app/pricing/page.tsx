import {
  PricingPageClient,
} from '@/components/pricing/PricingPageClient';

import {
  buildMetadata,
} from '@/lib/seo';

import {
  PageJsonLd,
} from '@/components/seo/PageJsonLd';


export const metadata =
  buildMetadata({
    title:
      'Xroga AI Pricing — Free & Xroga Pro',

    description:
      'Start building software with Xroga AI for free. Upgrade to Xroga Pro for $25/month for higher AI capacity, Full Access pacing, deeper product workflows, browser verification, repository engineering and production-focused building.',

    path:
      '/pricing',

    keywords: [
      'Xroga pricing',
      'Xroga AI pricing',
      'Xroga Pro',
      'AI coding agent pricing',
      'AI app builder pricing',
      'AI website builder pricing',
      'AI software builder',
      'AI coding platform',
      'vibe coding pricing',
      'AI developer agent',
      'AI product builder',
      'AI SaaS builder',
      'AI browser testing',
      'AI web research',
    ],
  });


export default function PricingPage() {

  return (
    <>
      <PageJsonLd
        path="/pricing"

        name="Xroga AI pricing"

        description="Xroga Free and Xroga Pro pricing for research, software building, repository engineering, browser verification, database workflows and publishing."
      />

      <PricingPageClient />
    </>
  );
}
