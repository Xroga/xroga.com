'use client';

import {
  AppWindow,
  Boxes,
  Globe2,
  Lightbulb,
  Smartphone,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { cn } from '@/lib/utils';

type IdeaGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  ideas: readonly string[];
};

const IDEA_GROUPS: readonly IdeaGroup[] = [
  {
    id: 'suggested',
    label: 'Suggestions',
    icon: Lightbulb,
    ideas: [
      'Build a polished SaaS landing page with pricing, FAQ, and a working waitlist.',
      'Turn my product brief into a responsive website and prepare it for deployment.',
      'Audit my connected repository, fix the highest-impact issue, and verify the result.',
      'Create a customer dashboard with onboarding, analytics, and account settings.',
      'Plan and build an AI assistant with streaming responses and conversation history.',
      'Refresh my existing product UI without changing its working business logic.',
    ],
  },
  {
    id: 'website',
    label: 'Websites',
    icon: Globe2,
    ideas: [
      'Build a premium agency website with case studies, services, and a contact flow.',
      'Create a fast editorial portfolio with project pages and a compact mobile layout.',
      'Design a conversion-focused product launch page with an interactive demo section.',
      'Build a trustworthy local business website with bookings, reviews, and maps.',
      'Create a modern documentation site with search, navigation, and code examples.',
      'Redesign my homepage around clearer messaging and stronger calls to action.',
    ],
  },
  {
    id: 'saas',
    label: 'SaaS apps',
    icon: AppWindow,
    ideas: [
      'Build a multi-tenant SaaS dashboard with onboarding, billing, and team roles.',
      'Create an AI research workspace with sources, saved sessions, and export tools.',
      'Build a lightweight CRM with pipelines, contacts, tasks, and activity history.',
      'Create a subscription analytics product with responsive charts and empty states.',
      'Build an internal operations portal with approvals, audit history, and search.',
      'Create a client portal for files, messages, milestones, and invoice status.',
    ],
  },
  {
    id: 'mobile',
    label: 'Mobile',
    icon: Smartphone,
    ideas: [
      'Design a mobile-first personal finance app with budgets and spending insights.',
      'Build a habit tracker with streaks, reminders, and an accessible dark mode.',
      'Create a food delivery app flow from discovery through live order tracking.',
      'Design a creator companion app for ideas, drafts, scheduling, and analytics.',
      'Build a fitness coaching app with plans, progress, and weekly check-ins.',
      'Create a mobile marketplace with search, favourites, chat, and checkout.',
    ],
  },
  {
    id: 'automation',
    label: 'Automation',
    icon: Workflow,
    ideas: [
      'Create a workflow that triages support requests and drafts accurate responses.',
      'Build an approval pipeline that routes submissions, reminders, and status updates.',
      'Connect a form to a searchable dashboard with validation and follow-up tasks.',
      'Automate a weekly product report from repository activity and deployment status.',
      'Build a content workflow from brief to review, approval, and publishing queue.',
      'Create an onboarding workflow that tracks setup steps and alerts blocked users.',
    ],
  },
] as const;

export function WorkspaceStarterIdeas({ className }: { className?: string }) {
  const { setPrompt } = useTerminalChat();
  const [groupId, setGroupId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const activeGroup = IDEA_GROUPS.find((group) => group.id === groupId) ?? null;
  const visibleIdeas = activeGroup?.ideas.slice(page * 3, page * 3 + 3) ?? [];

  useEffect(() => {
    const hideIdeasOnComposerInput = (event: Event) => {
      const target = event.target;
      if (
        target instanceof HTMLTextAreaElement
        && target.matches('textarea[data-terminal-composer]')
        && target.value.trim()
      ) {
        setGroupId(null);
      }
    };

    document.addEventListener('input', hideIdeasOnComposerInput, true);
    return () => document.removeEventListener('input', hideIdeasOnComposerInput, true);
  }, []);

  const chooseGroup = (nextId: string) => {
    if (nextId === groupId) {
      setPage((current) => (current + 1) % 2);
      return;
    }
    setGroupId(nextId);
    setPage(0);
  };

  const fillComposer = (idea: string) => {
    setPrompt(idea);
    setGroupId(null);
    window.setTimeout(() => {
      const composer = document.querySelector<HTMLTextAreaElement>('textarea[data-terminal-composer]');
      composer?.focus();
      composer?.setSelectionRange(idea.length, idea.length);
    }, 20);
  };

  return (
    <section className={cn('xv-workspace-starter-ideas', className)} aria-label="Xroga starter ideas">
      <div className="xv-workspace-idea-tabs" role="tablist" aria-label="Xroga starter categories">
        {IDEA_GROUPS.map((group) => {
          const Icon = group.icon;
          const selected = group.id === activeGroup?.id;
          return (
            <button
              key={group.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={cn('xv-workspace-idea-tab', selected && 'is-active')}
              onClick={() => chooseGroup(group.id)}
              title={selected ? `Show more ${group.label.toLowerCase()} ideas` : `Show ${group.label.toLowerCase()} ideas`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              <span>{group.label}</span>
            </button>
          );
        })}
        {activeGroup ? (
          <button
            type="button"
            className="xv-workspace-idea-close"
            onClick={() => setGroupId(null)}
            aria-label="Hide ideas"
            title="Hide ideas"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {activeGroup ? (
        <div className="xv-workspace-idea-list" role="tabpanel" aria-label={`${activeGroup.label} ideas`}>
          {visibleIdeas.map((idea, index) => (
            <button key={idea} type="button" onClick={() => fillComposer(idea)}>
              <Boxes className="h-3.5 w-3.5" aria-hidden />
              <span>{idea}</span>
              <span className="xv-workspace-idea-number" aria-hidden>{String(index + 1).padStart(2, '0')}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
