import type { Metadata } from 'next';
import { buildMetadata, buildWebPageJsonLd } from '@/lib/seo';
import { BlackHoleExperience } from './BlackHoleExperience';
import './black-hole.css';

export const metadata: Metadata = buildMetadata({
  title: 'Black Hole V Infinity — The Human Future of Intelligence | XROGA',
  description:
    'Meet the vision behind Black Hole V Infinity: one continuously evolving XROGA intelligence experience designed to help humans create, build and execute meaningful work.',
  path: '/black-hole',
  keywords: [
    'Black Hole V Infinity',
    'XROGA Black Hole',
    'human AI collaboration',
    'XROGA intelligence',
    'AI work platform',
  ],
});

const pageJsonLd = buildWebPageJsonLd({
  path: '/black-hole',
  name: 'Black Hole V Infinity — XROGA',
  description:
    'A cinematic introduction to XROGA’s long-term vision: human-directed intelligence, verifiable work, continuous improvement and humility.',
});

export default function BlackHolePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(pageJsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <BlackHoleExperience />
    </>
  );
}
