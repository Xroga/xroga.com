import type { Metadata } from 'next';
import './os-preview.css';

export const metadata: Metadata = {
  title: 'Xroga OS Preview',
  description: 'Explore the planned Xroga OS experience and try a clearly labelled, client-side example journey.',
  robots: { index: false, follow: false },
};

export default function OsPreviewLayout({ children }: { children: React.ReactNode }) { return children; }
