import { ComingSoonPanel } from '@/components/dashboard/ComingSoonPanel';
import { PAGE_SEO } from '@/lib/dashboard-metadata';

export const metadata = PAGE_SEO.media;

export default function MediaPage() {
  return (
    <ComingSoonPanel
      title="AI Media"
      description="Legacy image generation and media library are retired while we rebuild the AI system."
      backHref="/workspace"
      backLabel="Back to Workspace"
    />
  );
}
