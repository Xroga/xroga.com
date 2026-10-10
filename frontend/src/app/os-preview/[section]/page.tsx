import { notFound } from 'next/navigation';
import { OsPreviewShell } from '@/components/os-preview/OsPreviewShell';
import { Command2Section } from '@/components/os-preview/Command2Sections';
import { PREVIEW_DESTINATIONS, previewDestination } from '@/lib/osPreviewNavigation';

export function generateStaticParams() { return PREVIEW_DESTINATIONS.filter((item) => item.slug !== 'rich-results').map((item) => ({ section: item.slug })); }

export default async function OsPreviewSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const destination = previewDestination(section);
  if (!destination || section === 'rich-results') notFound();
  return <OsPreviewShell context={destination.label}><Command2Section section={section}/></OsPreviewShell>;
}
