'use client';

import { useId, useState } from 'react';
import {
  Boxes,
  Database,
  FolderGit2,
  GitBranch,
  KeyRound,
  Layers,
  Plug,
  Rocket,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react';

/**
 * The dark bento with working filters.
 *
 * A tablist with roving arrow-key focus, so it is operable from the keyboard rather
 * than only clickable — a row of buttons that changed nothing would be a fake control.
 *
 * The centre card is the dominant one and carries the artwork; the rest are flat
 * surfaces, because a grid where every tile has artwork becomes a collage.
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

type Card = {
  group: Group;
  title: string;
  body: string;
  icon: typeof Layers;
  glow: string;
  feature?: boolean;
};

const CARDS: ReadonlyArray<Card> = [
  {
    group: 'build',
    title: 'Requirements become subtasks',
    body: 'A product outcome is translated into executable work rather than answered as one unstructured prompt.',
    icon: Layers,
    glow: 'rgba(0, 106, 255, 0.55)',
  },
  {
    group: 'build',
    title: 'One connected product',
    body: 'Interface, API routes, persistent data and authorized integrations are built together, not as separate fragments.',
    icon: Boxes,
    glow: 'rgba(56, 210, 255, 0.42)',
    feature: true,
  },
  {
    group: 'collaborate',
    title: 'Repository-backed',
    body: 'The result stays inspectable in a repository instead of disappearing into a closed visual editor.',
    icon: FolderGit2,
    glow: 'rgba(0, 176, 255, 0.45)',
  },
  {
    group: 'integrate',
    title: 'Authorized integrations',
    body: 'Connect the services the product needs. Access stays scoped to what you have explicitly authorized.',
    icon: Plug,
    glow: 'rgba(0, 106, 255, 0.5)',
  },
  {
    group: 'build',
    title: 'Persistent data',
    body: 'Schema, storage and the queries around them are treated as part of the product, not an afterthought.',
    icon: Database,
    glow: 'rgba(109, 92, 255, 0.4)',
  },
  {
    group: 'scale',
    title: 'Architecture is reused',
    body: 'Existing structure, conventions and tests are reused, so later work extends the product instead of restarting it.',
    icon: GitBranch,
    glow: 'rgba(0, 176, 255, 0.4)',
  },
  {
    group: 'secure',
    title: 'Validation decides status',
    body: 'Applicable typechecks, tests, builds and runtime checks determine the final status — not a model asserting it finished.',
    icon: ShieldCheck,
    glow: 'rgba(56, 210, 255, 0.42)',
  },
  {
    group: 'scale',
    title: 'Previews and deployment',
    body: 'Prepare previews or production deployments when the required providers are configured in your own accounts.',
    icon: Rocket,
    glow: 'rgba(0, 106, 255, 0.5)',
  },
  {
    group: 'secure',
    title: 'Credentials stay yours',
    body: 'Provider ownership stays in your accounts. External systems that need credentials ask for approval first.',
    icon: KeyRound,
    glow: 'rgba(109, 92, 255, 0.42)',
  },
  {
    group: 'collaborate',
    title: 'A real terminal',
    body: 'Follow the work as it happens, with the same output the agent is acting on rather than a summary of it.',
    icon: TerminalSquare,
    glow: 'rgba(0, 106, 255, 0.45)',
  },
];

export function SoftwareFeatureTabs() {
  const [active, setActive] = useState<'all' | Group>('all');
  const base = useId();

  const shown = active === 'all' ? CARDS : CARDS.filter((c) => c.group === active);

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
      <div className="xsw-tabs" role="tablist" aria-label="Filter capabilities">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            id={`${base}-tab-${tab.id}`}
            type="button"
            role="tab"
            className="xsw-tab"
            aria-selected={active === tab.id}
            aria-controls={`${base}-panel`}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
            onKeyDown={(e) => move(index, e.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="xsw-bento" id={`${base}-panel`} role="tabpanel" aria-live="polite">
        {shown.map((card) => {
          const Icon = card.icon;
          const feature = card.feature && active === 'all';
          return (
            <article
              key={card.title}
              className={`xsw-card${feature ? ' xsw-card--feature' : ''}`}
              style={{ '--xsw-glow': card.glow } as React.CSSProperties}
            >
              <span className="xsw-icon" aria-hidden="true"><Icon /></span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </article>
          );
        })}
      </div>
    </>
  );
}
