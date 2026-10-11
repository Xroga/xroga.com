import { notFound } from 'next/navigation';
import { OsPreviewShell } from '@/components/os-preview/OsPreviewShell';
import { Command2Section } from '@/components/os-preview/Command2Sections';
import { previewDestination } from '@/lib/osPreviewNavigation';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function OsPreviewSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const destination = previewDestination(section);
  if (!destination || section === 'rich-results') notFound();
  return <OsPreviewShell context={destination.label}><Command2Section section={section}/></OsPreviewShell>;
}
