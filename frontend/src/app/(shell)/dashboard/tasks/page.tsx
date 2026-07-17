import { ComingSoonPanel } from '@/components/dashboard/ComingSoonPanel';
import { PAGE_SEO } from '@/lib/dashboard-metadata';

export const metadata = PAGE_SEO.tasks;

export default function TasksPage() {
  return (
    <ComingSoonPanel
      title="Earn XRG"
      description="XRG tasks, token boosts, and reward meters have been removed from the live product surface."
      backHref="/dashboard"
      backLabel="Back to Dashboard"
    />
  );
}
