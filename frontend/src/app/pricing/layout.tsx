import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Pricing — Galactic Action Plans',
  description:
    'Xroga AI pricing: action-based plans for building apps, games, websites, and browser automation. Honest per-task costs with 710+ integrations.',
  path: '/pricing',
  keywords: ['Xroga pricing', 'AI actions', 'AI subscription'],
});

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
