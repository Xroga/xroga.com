import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ExistingSourcePanel } from '@/components/existing-source/ExistingSourcePanel';
import { EXISTING_SOURCE_ENABLED } from '@/lib/existingSourceApi';

export const metadata: Metadata = { title: 'Existing repositories', robots: { index: false, follow: false } };

/** Signed-in only (the shell layout enforces it). Absent until Batch 3 is authorised for release. */
export default function ExistingSourcePage() {
  if (!EXISTING_SOURCE_ENABLED) notFound();
  return <ExistingSourcePanel />;
}
