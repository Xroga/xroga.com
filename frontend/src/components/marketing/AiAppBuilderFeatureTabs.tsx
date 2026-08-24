'use client';

import { useId, useState } from 'react';
import {
  Boxes,
  FolderGit2,
  GitBranch,
  KeyRound,
  Layers,
  Plug,
  Rocket,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from 'lucide-react';

/**
 * The dark bento section's tabs.
 *
 * The tabs genuinely filter — a decorative row of buttons that changes nothing would
 * be a fake control. Implemented as an ARIA tablist with roving arrow-key focus, so it
 * is operable from the keyboard rather than only clickable.
 *
 * Every card describes something the capability data actually claims. Nothing here
 * asserts certification, customer counts, or uptime.
 */
type Group = 'build' | 'integrate' | 'scale' | 'collaborate' | 'secure';

const TABS: ReadonlyArray<{ id: 'all' | Group; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'build', label: 'Build' },
  { id: 'integrate', label: 'Integrate' },
  { id: 'scale', label: 'Scale' },
  { id: 'collaborate', label: 'Collaborate' },
  { id: 'secure', label: 'Secure' },
];

const CARDS: ReadonlyArray<{
  group: Group;
  title: string;
  body: string;
  icon: typeof Sparkles;
  glow: string;
}> = [
  {
    group: 'build',
    title: 'App generation',
    body: 'Describe a product outcome and Xroga translates the requirements into executable subtasks rather than a single unstructured prompt.',
    icon: Sparkles,
    glow: 'rgba(0, 106, 255, 0.55)',
  },
  {
    group: 'build',
    title: 'UI, APIs and data together',
    body: 'Interface, API routes, persistent data and authorized integrations are built as one connected product, not as separate fragments.',
    icon: Layers,
    glow: 'rgba(124, 77, 255, 0.45)',
  },
  {
    group: 'collaborate',
    title: 'Repository-backed work',
    body: 'The result stays inspectable in a repository instead of disappearing into a closed visual editor you cannot read.',
    icon: FolderGit2,
    glow: 'rgba(0, 176, 255, 0.45)',
  },
  {
    group: 'integrate',
    title: 'Authorized integrations',
    body: 'Connect the services your product needs. Access stays scoped to what you have explicitly authorized.',
    icon: Plug,
    glow: 'rgba(0, 106, 255, 0.5)',
  },
  {
    group: 'scale',
    title: 'Reused architecture',
    body: 'Existing project structure, conventions and tests are reused, so later work extends the product instead of restarting it.',
    icon: Boxes,
    glow: 'rgba(124, 77, 255, 0.4)',
  },
  {
    group: 'secure',
    title: 'Validation decides status',
    body: 'Applicable typechecks, tests, builds and runtime checks determine the final status — not the model asserting it finished.',
    icon: ShieldCheck,
    glow: 'rgba(0, 176, 255, 0.42)',
  },
  {
    group: 'scale',
    title: 'Previews and deployment',
    body: 'Prepare previews or production deployments when the required providers are configured in your own accounts.',
    icon: Rocket,
    glow: 'rgba(0, 106, 255, 0.5)',
  },
  {
    group: 'collaborate',
    title: 'Inspectable changes',
    body: 'Work lands as readable changes you can review, branch and revert with the tooling your team already uses.',
    icon: GitBranch,
    glow: 'rgba(124, 77, 255, 0.42)',
  },
  {
    group: 'secure',
    title: 'Credentials stay yours',
    body: 'Provider ownership stays in your accounts. External systems that need credentials ask for your approval first.',
    icon: KeyRound,
    glow: 'rgba(0, 176, 255, 0.45)',
  },
  {
    group: 'build',
    title: 'A real terminal, not a black box',
    body: 'Follow the work as it happens in the workspace terminal, with the same output the agent is acting on.',
    icon: TerminalSquare,
    glow: 'rgba(0, 106, 255, 0.45)',
  },
];

export function AiAppBuilderFeatureTabs() {
  const [active, setActive] = useState<'all' | Group>('all');
  const base = useId();

  const shown = active === 'all' ? CARDS : CARDS.filter((card) => card.group === active);

  const move = (index: number, key: string) => {
    if (key !== 'ArrowRight' && key !== 'ArrowLeft') return;
    const next = key === 'ArrowRight'
      ? (index + 1) % TABS.length
      : (index - 1 + TABS.length) % TABS.length;
    setActive(TABS[next].id);
    document.getElementById(`${base}-tab-${TABS[next].id}`)?.focus();
  };

  return (
    <>
      <div className="xab-tabs" role="tablist" aria-label="Filter capabilities">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            id={`${base}-tab-${tab.id}`}
            type="button"
            role="tab"
            className="xab-tab"
            aria-selected={active === tab.id}
            aria-controls={`${base}-panel`}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
            onKeyDown={(event) => move(index, event.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="xab-bento" id={`${base}-panel`} role="tabpanel" aria-live="polite">
        {shown.map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.title}
              className="xab-bento__card"
              style={{ '--xab-glow': card.glow } as React.CSSProperties}
            >
              <span className="xab-bento__icon" aria-hidden="true"><Icon /></span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </article>
          );
        })}
      </div>
    </>
  );
}
