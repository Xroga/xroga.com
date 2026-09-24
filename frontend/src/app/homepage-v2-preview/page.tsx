import type { Metadata } from 'next';
import '@/styles/homepage-coding.css';
import '@/styles/homepage-v2-preview.css';
import { HomepageV2Preview } from '@/components/homepage/HomepageV2Preview';

export const metadata: Metadata = {
  title: 'Xroga Homepage Redesign Preview',
  description: 'Private redesign preview for the next Xroga homepage.',
  robots: { index: false, follow: false },
};

export default function HomepageV2PreviewPage() {
  return <HomepageV2Preview />;
}
