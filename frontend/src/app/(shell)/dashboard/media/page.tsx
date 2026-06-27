import { MediaPageClient } from '@/components/dashboard/MediaPageClient';
import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'AI Media Library — Images, Video & Audio',
  description:
    'Browse and manage AI-generated images, videos, and audio from your Xroga Swarm. Upload assets and reuse them across projects.',
  path: '/dashboard/media',
  keywords: ['Xroga media', 'AI images', 'AI video', 'AI audio library', 'roga assets'],
});

export default function MediaPage() {
  return <MediaPageClient />;
}
