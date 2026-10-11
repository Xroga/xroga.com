import type { Metadata } from 'next';
import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import { hasFounderSession } from '@/lib/osFounderSession';
import { FounderOperations } from '@/components/os-preview/FounderOperations';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const metadata: Metadata = { title: 'Founder Operations | Xroga', robots: { index: false, follow: false, noarchive: true } };

export default async function FounderOperationsPage() {
  noStore();
  if (!await hasFounderSession()) notFound();
  return <FounderOperations />;
}
