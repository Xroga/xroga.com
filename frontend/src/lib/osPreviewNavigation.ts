import type { PreviewFeatureAvailability } from './osPreview';

export interface PreviewDestination {
  slug: string;
  label: string;
  group: 'Start' | 'Your work' | 'Capabilities' | 'Library';
  availability: PreviewFeatureAvailability;
  benefit: string;
  detail: string;
  liveHref?: string;
}

export const PREVIEW_DESTINATIONS: PreviewDestination[] = [
  { slug: 'workspace', label: 'Workspace', group: 'Your work', availability: 'available-now', benefit: 'Start with your outcome, then work with Xroga in one place.', detail: 'The existing workspace is available today for chat, projects and supported execution. This OS preview does not change its behavior.', liveHref: '/workspace' },
  { slug: 'projects', label: 'Projects', group: 'Your work', availability: 'available-now', benefit: 'Return to your saved work.', detail: 'The current Projects area holds account-bound workspaces and repository context. Sign-in may be needed for private actions.', liveHref: '/dashboard/projects' },
  { slug: 'coding', label: 'Coding', group: 'Capabilities', availability: 'interactive-preview', benefit: 'See how a software outcome could become a reviewable plan.', detail: 'Try the code-repair fixture in the Command 1 simulator. No repository is read or changed.' },
  { slug: 'rich-results', label: 'Rich answer gallery', group: 'Capabilities', availability: 'interactive-preview', benefit: 'Explore sourced result cards across many kinds of answers.', detail: 'Test illustrative response cards using the same renderer as ordinary Xroga chat.' },
  { slug: 'browser', label: 'Browser', group: 'Capabilities', availability: 'coming-soon', benefit: 'Review web actions before they happen.', detail: 'The future Browser Worker will show proposed navigation, evidence and approvals in one inspectable flow.' },
  { slug: 'automations', label: 'Automations', group: 'Capabilities', availability: 'coming-soon', benefit: 'Turn repeat work into a controlled routine.', detail: 'Intended for scheduled and triggered workflows with clear scopes, approvals and history.' },
  { slug: 'employees', label: 'AI Employees', group: 'Capabilities', availability: 'coming-soon', benefit: 'Bring the right specialist to each task.', detail: 'A future roster for focused work roles and supervised handoffs, not active workers in this preview.' },
  { slug: 'work-packs', label: 'Work Packs', group: 'Capabilities', availability: 'coming-soon', benefit: 'Reuse the shape of successful work.', detail: 'Planned repeatable outcome templates with inputs, checks and approval points.' },
  { slug: 'genome', label: 'Genome', group: 'Library', availability: 'coming-soon', benefit: 'Understand how a product was made.', detail: 'App Genome is a planned reusable product blueprint with decisions and dependencies.' },
  { slug: 'artifacts', label: 'Artifacts', group: 'Library', availability: 'coming-soon', benefit: 'Keep deliverables and their proof together.', detail: 'Planned artifact library with versions, source links and acceptance records.' },
  { slug: 'drive', label: 'Xroga Drive', group: 'Library', availability: 'coming-soon', benefit: 'Find your working files in one place.', detail: 'Planned account-bound file organization. No new file service is connected in Command 1.' },
  { slug: 'insights', label: 'Insights', group: 'Library', availability: 'coming-soon', benefit: 'Know what work changed and what needs attention.', detail: 'Planned evidence-backed usage and quality views. There are no live analytics numbers in this preview.' },
  { slug: 'settings', label: 'Settings', group: 'Your work', availability: 'available-now', benefit: 'Make the current workspace yours.', detail: 'Existing settings let you adjust supported account and appearance preferences.', liveHref: '/settings' },
];

export const PREVIEW_GROUPS = ['Your work', 'Capabilities', 'Library'] as const;

export function previewDestination(slug: string): PreviewDestination | undefined {
  return PREVIEW_DESTINATIONS.find((item) => item.slug === slug);
}
