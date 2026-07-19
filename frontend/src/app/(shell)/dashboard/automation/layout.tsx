import { buildMetadata } from '@/lib/seo';

export const metadata = buildMetadata({
  title: 'Build Runs — Workspace History',
  description:
    'View running, failed, and completed Xroga AI build runs in Workspace. Continue coding-agent tasks, GitHub pushes, and Vercel deploys from your history.',
  path: '/dashboard/automation',
  keywords: ['Xroga build history', 'coding agent runs', 'workspace history'],
});

export default function AutomationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
