import type { Metadata } from 'next';
import { UpcomingCapabilitySection } from '@/components/dashboard/UpcomingCapabilitySection';

export const metadata: Metadata = { title: 'Automations | Xroga', robots: { index: false, follow: false } };

export default function AutomationsPage() {
  return <UpcomingCapabilitySection title="Automations" description="A place for repeatable work, scheduling, and AI specialists. Browse these sections while we finish production execution."
    entries={[
      { id: 'workflows', name: 'Workflows', summary: 'Design sequences of connected-app actions with verification and approval gates.' },
      { id: 'scheduled-tasks', name: 'Scheduled Tasks', summary: 'Manage work that should run later or on a recurring schedule.' },
      { id: 'ai-employees', name: 'AI Employees', summary: 'Specialized AI workers for repeatable roles inside the Xroga workspace.' },
      { id: 'work-packs', name: 'Work Packs', summary: 'Reusable work instructions and validated procedures for common outcomes.' },
      { id: 'run-history', name: 'Run History', summary: 'Review automation execution history and evidence for completed actions.' },
    ]} />;
}
