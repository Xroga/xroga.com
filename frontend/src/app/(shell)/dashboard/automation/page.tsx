import { AutomationView } from '@/components/dashboard/AutomationView';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';
import { PAGE_SEO } from '@/lib/dashboard-metadata';

export const metadata = PAGE_SEO.automation;

export default function AutomationPage() {
  return (
    <PageFullscreenFrame>
      <AutomationView />
    </PageFullscreenFrame>
  );
}
