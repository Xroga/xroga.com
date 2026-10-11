import type { Metadata } from 'next';
import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import { hasFounderSession } from '@/lib/osFounderSession';
import './os-preview.css';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Xroga OS Preview',
  description: 'Explore the planned Xroga OS experience and try a clearly labelled, client-side example journey.',
  robots: { index: false, follow: false, noarchive: true },
};

export default async function OsPreviewLayout({ children }: { children: React.ReactNode }) {
  noStore();
  if (!await hasFounderSession()) notFound();
  return children;
}
