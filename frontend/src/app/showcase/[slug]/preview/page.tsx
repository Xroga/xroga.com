import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SHOWCASE_TEMPLATES, getShowcaseBySlug, isLive } from '@/lib/showcase/registry';
import { BusinessWebsite } from '@/components/showcase/products/BusinessWebsite';
import { RealEstatePlatform } from '@/components/showcase/products/RealEstatePlatform';
import { BookingPlatform } from '@/components/showcase/products/BookingPlatform';
import { WebGame } from '@/components/showcase/products/WebGame';
import { MobileApp } from '@/components/showcase/products/MobileApp';
import { AiSaas } from '@/components/showcase/products/AiSaas';

type Props = { params: Promise<{ slug: string }> };

/** Only live products have a renderer; the rest would prerender straight to 404. */
export function generateStaticParams() {
  return SHOWCASE_TEMPLATES.filter(isLive).map((template) => ({ slug: template.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const template = getShowcaseBySlug(slug);
  if (!template) return {};
  return {
    title: `${template.name} preview — Xroga AI`,
    description: template.shortDescription,
    // The preview is a bare product surface, not a page we want indexed on its own.
    robots: { index: false, follow: false },
    alternates: { canonical: `/showcase/${template.slug}` },
  };
}

/**
 * Renders a showcase product on its own, with no Xroga chrome, so it can be framed
 * by the device preview and opened full-screen. Products bring their own design
 * system deliberately.
 */
export default async function ShowcasePreviewPage({ params }: Props) {
  const { slug } = await params;
  const template = getShowcaseBySlug(slug);
  if (!template || !isLive(template)) notFound();

  switch (template.id) {
    case 'business-website':
      return <BusinessWebsite />;
    case 'real-estate-platform':
      return <RealEstatePlatform />;
    case 'booking-platform':
      return <BookingPlatform />;
    case 'web-game':
      return <WebGame />;
    case 'android-app':
      return <MobileApp />;
    case 'ai-saas':
      return <AiSaas />;
    default:
      // A template marked live must have a renderer; treat a gap as not-found
      // rather than showing an empty frame.
      notFound();
  }
}
