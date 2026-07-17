import { ComingSoonPanel } from '@/components/dashboard/ComingSoonPanel';
import { PAGE_SEO } from '@/lib/dashboard-metadata';

export const metadata = PAGE_SEO.automation;

export default function AutomationPage() {
  return (
    <ComingSoonPanel
      title="Automation"
      description="Browser automation and legacy automation runs are retired while we rebuild the AI system."
      backHref="/workspace"
      backLabel="Back to Workspace"
    />
  );
}
