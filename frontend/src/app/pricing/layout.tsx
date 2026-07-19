import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Pricing — Galactic Action Plans',
  description:
    'Xroga AI pricing for the #1 coding agent — plans with AI tokens to build websites and web apps, push to GitHub, deploy on Vercel, and keep updating the same repo. For developers and non-developers.',
  path: '/pricing',
  keywords: [
    'Xroga pricing',
    'AI coding agent pricing',
    'AI website builder pricing',
    'Xroga subscription',
  ],
});

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
