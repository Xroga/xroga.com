import type { Metadata } from 'next';
import { LibraryWorkspace } from '@/components/library/LibraryWorkspace';

export const metadata: Metadata = { title: 'Library | Xroga', robots: { index: false, follow: false } };

export default function LibraryPage() {
  return <LibraryWorkspace />;
}
