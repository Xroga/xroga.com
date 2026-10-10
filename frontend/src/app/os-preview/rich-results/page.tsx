import type { Metadata } from 'next';
import { OsPreviewShell } from '@/components/os-preview/OsPreviewShell';
import { RichResultsGallery } from './RichResultsGallery';

export const metadata: Metadata = {
  title: 'Rich answer testing gallery | Xroga OS Preview',
  description: 'Test clearly labelled example response cards across domains, layouts and screen sizes.',
  robots: { index: false, follow: false },
};

export default function RichResultsPage() {
  return <OsPreviewShell context="Rich answer gallery"><RichResultsGallery /></OsPreviewShell>;
}
