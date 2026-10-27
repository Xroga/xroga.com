import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { DrivePanel } from '@/components/drive/DrivePanel';
import { DRIVE_ENABLED } from '@/lib/driveApi';

export const metadata: Metadata = { title: 'Xroga Drive', robots: { index: false, follow: false } };

/** Signed-in only (the shell layout enforces it). Absent until Drive is activated for the deployment. */
export default function DrivePage() {
  if (!DRIVE_ENABLED) notFound();
  return <DrivePanel />;
}
