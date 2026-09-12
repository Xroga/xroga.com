'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, ArrowUpRight, ChevronDown, Clock3, Eye, FolderGit2, GitBranch, MessageSquareText, X } from 'lucide-react';
import { ShowcaseResumeBridge } from '@/components/showcase/ShowcaseResumeBridge';
import {
  SHOWCASE_TEMPLATES,
  THUMBNAIL_SIZES,
  previewRouteFor,
  thumbnailFor,
  type ShowcaseTemplate,
} from '@/lib/showcase/registry';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { cn } from '@/lib/utils';
import { AnimatedIcon, type AnimatedIconComponent } from '@/components/icons/animated/AnimatedIcon';
import { ActivityIcon } from '@/components/icons/animated/ActivityIcon';
import { LayoutGridIcon } from '@/components/icons/animated/LayoutGridIcon';
import { LightbulbIcon } from '@/components/icons/animated/LightbulbIcon';
import { UsersRoundIcon } from '@/components/icons/animated/UsersRoundIcon';
import { api, type GitHubRepo } from '@/lib/api';
import { loadTerminalHistory, type TerminalHistoryEntry } from '@/lib/terminalHistory';

type TemplateCollection = {
  id: string;
  title: string;
  description: string;
  attribution: string;
  icon: AnimatedIconComponent;
  templates: readonly ShowcaseTemplate[];
};

const TEMPLATE_COLLECTIONS: readonly TemplateCollection[] = [
  {
    id: 'xroga-templates',
    title: 'Xroga templates',
    description: 'Production-ready foundations you can make your own.',
    attribution: 'By Xroga templates',
    icon: LayoutGridIcon,
    templates: SHOWCASE_TEMPLATES,
  },
  {
    id: 'community-templates',
    title: 'Community templates',
    description: 'Open starting points for community remixes.',
    attribution: 'Ready to remix',
    icon: UsersRoundIcon,
    templates: SHOWCASE_TEMPLATES.slice(3),
  },
] as const;

function TemplateCatalog({
  templates,
  attribution,
  onSelect,
}: {
  templates: readonly ShowcaseTemplate[];
  attribution: string;
  onSelect: (template: ShowcaseTemplate) => void;
}) {
  return (
    <div className="xv-workspace-template-catalog">
      {templates.map((template, index) => (
        <button
          key={template.id}
          type="button"
          className="xv-workspace-template-card"
          style={{ '--template-accent': template.accent } as React.CSSProperties}
          onClick={() => onSelect(template)}
          aria-label={`Explore ${template.name} template`}
        >
          <span className="xv-workspace-template-visual">
            <Image
              src={thumbnailFor(template)}
              alt=""
              width={THUMBNAIL_SIZES.desktop.width}
              height={THUMBNAIL_SIZES.desktop.height}
              sizes="(max-width: 640px) 76vw, 280px"
            />
            <span>{template.category}</span>
          </span>
          <span className="xv-workspace-template-copy">
            <span className="xv-workspace-template-title-row">
              <strong>{template.name}</strong>
              <i>Live</i>
            </span>
            <small>{attribution}</small>
            <span className="xv-workspace-template-meta">
              <span>{String(index + 1).padStart(2, '0')} · {template.category}</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function TemplateDecisionDialog({
  template,
  onClose,
  onUse,
}: {
  template: ShowcaseTemplate;
  onClose: () => void;
  onUse: () => void;
}) {
  const previewRoute = previewRouteFor(template);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    closeRef.current?.focus();
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="xv-template-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="xv-template-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="xv-template-dialog-title"
        style={{ '--template-accent': template.accent } as React.CSSProperties}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button ref={closeRef} type="button" className="xv-template-dialog-close" onClick={onClose} aria-label="Close template preview">
          <X className="h-4 w-4" aria-hidden />
        </button>

        <div className="xv-template-dialog-preview">
          <Image
            src={thumbnailFor(template)}
            alt={`${template.name} desktop preview`}
            width={THUMBNAIL_SIZES.desktop.width}
            height={THUMBNAIL_SIZES.desktop.height}
            sizes="(max-width: 640px) 92vw, 720px"
          />
          <span>{template.category} · {template.status === 'live' ? 'Live' : 'In development'}</span>
        </div>

        <div className="xv-template-dialog-copy">
          <div>
            <p>Proven Xroga build</p>
            <h2 id="xv-template-dialog-title">{template.name}</h2>
          </div>
          <p>{template.longDescription}</p>
          <ul aria-label="Template capabilities">
            {template.capabilities.slice(0, 3).map((capability) => <li key={capability}>{capability}</li>)}
          </ul>
          <div className="xv-template-dialog-tech" aria-label="Technologies">
            {template.technologies.map((technology) => <span key={technology}>{technology}</span>)}
          </div>
        </div>

        <div className="xv-template-dialog-actions">
          {previewRoute ? (
            <a href={previewRoute} target="_blank" rel="noreferrer" className="xv-template-dialog-secondary">
              <Eye className="h-4 w-4" aria-hidden />
              Full preview
            </a>
          ) : null}
          <button type="button" className="xv-template-dialog-primary" onClick={onUse}>
            <GitBranch className="h-4 w-4" aria-hidden />
            Use prompt &amp; ship
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

/** Collapsed inspiration catalog for an empty workspace. */
export function WorkspaceShowcaseStarts({ className }: { className?: string }) {
  const router = useRouter();
  const { setPrompt, restoreTerminalSession } = useTerminalChat();
  const [selectedTemplate, setSelectedTemplate] = useState<ShowcaseTemplate | null>(null);
  const [recentSessions, setRecentSessions] = useState<TerminalHistoryEntry[]>([]);
  const [repositories, setRepositories] = useState<GitHubRepo[]>([]);
  const [expanded, setExpanded] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const collectionsRef = useRef<HTMLDivElement>(null);
  const autoOpenedRef = useRef(false);

  useEffect(() => {
    setRecentSessions(loadTerminalHistory().filter((entry) => Boolean(entry.githubRepoName)).slice(0, 6));
    let active = true;
    void api.github.listRepos().then(({ repos }) => {
      if (active) setRepositories(repos.slice(0, 8));
    }).catch(() => {
      if (active) setRepositories([]);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    const scrollRoot = section?.closest<HTMLElement>('.xv-terminal-dock--idle');
    if (!section || !scrollRoot) return;

    const syncPinnedBar = () => {
     const rootRect = scrollRoot.getBoundingClientRect();

/*
 * Kimi-style centered inspiration dock.
 *
 * Center against the real workspace viewport, NOT against the
 * narrower starter-content section.
 */
const horizontalInset = 16;
const maxBarWidth = 772;

const availableWidth = Math.max(
  280,
  rootRect.width - horizontalInset * 2
);

const barWidth = Math.min(
  maxBarWidth,
  availableWidth
);

const barLeft =
  rootRect.left +
  (rootRect.width - barWidth) / 2;

section.style.setProperty(
  '--xv-explore-left',
  `${barLeft}px`
);

section.style.setProperty(
  '--xv-explore-width',
  `${barWidth}px`
);

section.style.setProperty(
  '--xv-explore-bottom',
  `${Math.max(
    6,
    window.innerHeight - rootRect.bottom + 6
  )}px`
);

/* CLOSE syncPinnedBar */
};

    const openFromScroll = () => {
      syncPinnedBar();
      if (scrollRoot.scrollTop > 28 && !autoOpenedRef.current) {
        autoOpenedRef.current = true;
        setExpanded(true);
      } else if (scrollRoot.scrollTop <= 2 && autoOpenedRef.current) {
        autoOpenedRef.current = false;
        setExpanded(false);
      }
    };

    syncPinnedBar();
    const resizeObserver = new ResizeObserver(syncPinnedBar);
    resizeObserver.observe(section);
    resizeObserver.observe(scrollRoot);
    window.addEventListener('resize', syncPinnedBar, { passive: true });
    scrollRoot.addEventListener('scroll', openFromScroll, { passive: true });
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', syncPinnedBar);
      scrollRoot.removeEventListener('scroll', openFromScroll);
    };
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const frame = window.requestAnimationFrame(() => {
      collectionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [expanded]);

  const toggleCatalog = () => {
    setExpanded((current) => !current);
  };

  const useTemplate = () => {
    if (!selectedTemplate) return;
    const prompt = `${selectedTemplate.defaultBuildPrompt}\n\nBuild this as my own responsive product, preserve the strongest interaction patterns, push the finished code to my selected GitHub repository, and verify the result before reporting completion.`;
    setPrompt(prompt);
    setSelectedTemplate(null);
    window.setTimeout(() => {
      const composer = document.querySelector<HTMLTextAreaElement>('textarea[data-terminal-composer]');
      composer?.focus();
      composer?.setSelectionRange(prompt.length, prompt.length);
    }, 20);
  };

  const openRecentSession = async (entry: TerminalHistoryEntry) => {
    const { loadTerminalHistoryEntry } = await import('@/lib/terminalSessionStorage');
    const stored = await loadTerminalHistoryEntry(entry.id);
    const messages = stored?.messages?.length ? stored.messages : entry.messages;
    if (!messages.length) return;
    await restoreTerminalSession({
      sessionId: entry.id,
      prompt: entry.prompt,
      messages,
      selectedId: entry.id,
      selectedLabel: entry.title,
      source: 'projects',
      githubRepoName: entry.githubRepoName,
    });
    router.push('/workspace');
  };

  return (
    <>
      <section
        ref={sectionRef}
        className={cn('xv-workspace-templates', className)}
        data-expanded={expanded}
        aria-labelledby="workspace-showcase-heading"
      >
      <Suspense fallback={null}>
        <ShowcaseResumeBridge />
      </Suspense>

      <button
        type="button"
        className="xv-workspace-explore-bar"
        onClick={toggleCatalog}
        aria-expanded={expanded}
        aria-controls="workspace-template-collections"
      >
        <span className="xv-workspace-explore-label">
          <AnimatedIcon icon={LightbulbIcon} size={15} intro={false} />
          <span>
            <strong id="workspace-showcase-heading">Explore inspiration</strong>
            <small>Real products, ready to remix</small>
          </span>
        </span>
        <span className="xv-workspace-explore-action">
          {expanded ? 'Close inspiration' : 'Scroll to explore'}
          <ChevronDown className={cn('h-3.5 w-3.5', expanded && 'is-open')} aria-hidden />
        </span>
      </button>

      {expanded ? (
        <div
          id="workspace-template-collections"
          ref={collectionsRef}
          className="xv-workspace-template-collections"
        >
          <section className="xv-workspace-template-collection" aria-labelledby="recent-projects-heading">
            <header className="xv-workspace-collection-head">
              <span className="xv-workspace-collection-title">
                <AnimatedIcon icon={ActivityIcon} size={14} intro={false} />
                <span><strong id="recent-projects-heading">Recent projects</strong><small>Your saved work and connected repositories.</small></span>
              </span>
              <Link href="/dashboard/projects">Browse all <ArrowUpRight className="h-3 w-3" aria-hidden /></Link>
            </header>
            <div className="xv-workspace-real-projects" role="list">
              {recentSessions.map((entry) => (
                <button key={entry.id} type="button" role="listitem" onClick={() => void openRecentSession(entry)}>
                  <span className="xv-workspace-project-folder"><MessageSquareText aria-hidden="true" /><i>{entry.messageCount}</i></span>
                  <strong>{entry.title}</strong>
                  <small><Clock3 aria-hidden="true" /> {new Date(entry.updatedAt).toLocaleDateString()}</small>
                  <code>{entry.githubRepoName}</code>
                </button>
              ))}
              {repositories.filter((repo) => !recentSessions.some((entry) => entry.githubRepoName === repo.fullName)).slice(0, Math.max(0, 6 - recentSessions.length)).map((repo) => (
                <button key={repo.fullName} type="button" role="listitem" onClick={() => router.push('/dashboard/projects')}>
                  <span className="xv-workspace-project-folder"><FolderGit2 aria-hidden="true" /><i>{repo.private ? 'Private' : 'Public'}</i></span>
                  <strong>{repo.fullName.split('/').at(-1)}</strong>
                  <small><GitBranch aria-hidden="true" /> {repo.defaultBranch}</small>
                  <code>{repo.fullName}</code>
                </button>
              ))}
              {recentSessions.length === 0 && repositories.length === 0 ? (
                <div className="xv-workspace-projects-empty" role="listitem"><FolderGit2 aria-hidden="true" /><span><strong>No saved projects yet</strong><small>Connect GitHub or start a build. Your real work will appear here.</small></span></div>
              ) : null}
            </div>
          </section>
          {TEMPLATE_COLLECTIONS.map((collection) => {
            const Icon = collection.icon;
            return (
              <section
                key={collection.id}
                className="xv-workspace-template-collection"
                aria-labelledby={`${collection.id}-heading`}
              >
                <header className="xv-workspace-collection-head">
                  <span className="xv-workspace-collection-title">
                    <AnimatedIcon icon={Icon} size={14} intro={false} />
                    <span>
                      <strong id={`${collection.id}-heading`}>{collection.title}</strong>
                      <small>{collection.description}</small>
                    </span>
                  </span>
                  {collection.id === 'xroga-templates' ? (
                    <Link href="/showcase">
                      Browse all <ArrowUpRight className="h-3 w-3" aria-hidden />
                    </Link>
                  ) : null}
                </header>
                <div className="xv-workspace-template-viewport">
                  <TemplateCatalog
                    templates={collection.templates}
                    attribution={collection.attribution}
                    onSelect={setSelectedTemplate}
                  />
                </div>
              </section>
            );
          })}
        </div>
      ) : null}
      </section>
      {selectedTemplate ? (
        <TemplateDecisionDialog
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
          onUse={useTemplate}
        />
      ) : null}
    </>
  );
}
