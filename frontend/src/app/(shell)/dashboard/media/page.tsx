import { MediaPageClient } from '@/components/dashboard/MediaPageClient';
import { PAGE_SEO } from '@/lib/dashboard-metadata';

export const metadata = PAGE_SEO.media;

export default function MediaPage() {
  return <MediaPageClient />;
}
