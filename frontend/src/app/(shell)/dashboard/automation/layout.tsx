import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Automation — Swarm Runs & Browser Tasks',
  description:
    'View running, failed, and completed Xroga AI automations. Continue browser scrape and research tasks from your swarm history.',
  path: '/dashboard/automation',
  keywords: ['AI automation', 'browser automation', 'swarm history'],
});

export default function AutomationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
