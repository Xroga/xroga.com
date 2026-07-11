'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  FolderOpen,
  Plus,
  Rocket,
  Sparkles,
  ExternalLink,
  MessageSquare,
  Code2,
  Link2,
} from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';
import { SectionSearchBar } from '@/components/ui/SectionSearchBar';
import { SectionCompactCard } from '@/components/dashboard/SectionCompactCard';
import { SwarmRunHistory } from '@/components/dashboard/SwarmRunHistory';
import { api, type Project } from '@/lib/api';
import {
  filterProjectsForSection,
  loadLocalProjects,
  removeLocalProject,
  type LocalProjectEntry,
} from '@/lib/projectArchive';
import { loadTerminalHistory, removeTerminalHistoryEntry, type TerminalHistoryEntry } from '@/lib/terminalHistory';
import { loadChatArchive, removeChatArchiveEntry, type ChatArchiveEntry } from '@/lib/chatArchive';
import { resumeToDashboard } from '@/lib/workspacePersistence';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import 'react-loading-skeleton/dist/skeleton.css';

const BUILD_TYPES = new Set(['website', 'app', 'game', 'software', 'extension', 'tool']);

type Tab = 'projects' | 'conversations';

function ProjectsHubInner() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'conversations' ? 'conversations' : 'projects';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [projects, setProjects] = useState<Project[]>([]);
  const [localProjects, setLocalProjects] = useState<LocalProjectEntry[]>([]);
  const [history, setHistory] = useState<TerminalHistoryEntry[]>([]);
  const [archives, setArchives] = useState<ChatArchiveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const router = useRouter();
  const { setPrompt, hydrateFromSession } = useTerminalChat();

  useEffect(() => {
    setTab(searchParams.get('tab') === 'conversations' ? 'conversations' : 'projects');
  }, [searchParams]);

  useEffect(() => {
    setLocalProjects(filterProjectsForSection(loadLocalProjects()));
    setHistory(loadTerminalHistory());
    setArchives(loadChatArchive());
    api.projects
      .list()
      .then((list) => setProjects(list.filter((p) => BUILD_TYPES.has(p.type.toLowerCase()))))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  const filteredLocal = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return localProjects;
    return localProjects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.prompt.toLowerCase().includes(q) || p.type.includes(q),
    );
  }, [localProjects, query]);

  const filteredRemote = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.type.toLowerCase().includes(q) ||
        (p.github_repo_name?.toLowerCase().includes(q) ?? false),
    );
  }, [projects, query]);

  const conversationItems = useMemo(() => {
    const seen = new Set<string>();
    const items: Array<{
      id: string;
      title: string;
      subtitle: string;
      dateIso: string;
      messages: TerminalHistoryEntry['messages'];
      sessionId: string;
      jumpMessageId?: string;
      githubRepoUrl?: string;
      githubRepoName?: string;
      deployUrl?: string;
      kind: 'session' | 'archive';
    }> = [];

    for (const h of history) {
      if (seen.has(h.id)) continue;
      seen.add(h.id);
      items.push({
        id: h.id,
        title: h.title,
        subtitle: h.preview.slice(0, 80),
        dateIso: h.updatedAt,
        messages: h.messages,
        sessionId: h.id,
        githubRepoUrl: h.githubRepoUrl,
        githubRepoName: h.githubRepoName,
        deployUrl: h.deployUrl,
        kind: 'session',
      });
    }

    for (const a of archives) {
      if (seen.has(a.id)) continue;
      items.push({
        id: a.id,
        title: a.title,
        subtitle: a.preview.slice(0, 80),
        dateIso: a.createdAt,
        messages: a.messages,
        sessionId: a.id,
        jumpMessageId: a.assistantMessageId ?? a.userMessageId,
        kind: 'archive',
      });
    }

    items.sort((a, b) => Date.parse(b.dateIso) - Date.parse(a.dateIso));
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) => i.title.toLowerCase().includes(q) || i.subtitle.toLowerCase().includes(q),
    );
  }, [history, archives, query]);

  function openConversation(item: (typeof conversationItems)[0]) {
    setPrompt(item.messages.find((m) => m.role === 'user')?.content ?? item.title);
    resumeToDashboard({
      prompt: item.title,
      messages: item.messages,
      sessionId: item.sessionId,
      selectedId: item.id,
      selectedLabel: item.title,
      source: 'chats',
      jumpMessageId: item.jumpMessageId,
    });
    router.push('/dashboard');
    setTimeout(() => hydrateFromSession(), 100);
    toast('Restored — exactly where you left off', { icon: '📍' });
  }

  function openLocalProject(p: LocalProjectEntry) {
    const session = history.find((h) => h.prompt === p.prompt || h.id === p.sourceMessageId);
    if (session?.messages?.length) {
      openConversation({
        id: session.id,
        title: session.title,
        subtitle: session.preview,
        dateIso: session.updatedAt,
        messages: session.messages,
        sessionId: session.id,
        kind: 'session',
      });
      return;
    }
    setPrompt(p.prompt);
    resumeToDashboard({
      prompt: p.prompt,
      selectedId: p.id,
      selectedLabel: p.name,
      source: 'projects',
      jumpMessageId: p.sourceMessageId,
    });
    router.push('/dashboard');
  }

  function openRemoteProject(project: Project) {
    router.push(`/dashboard/projects/${project.id}`);
  }

  function deleteLocal(id: string) {
    removeLocalProject(id);
    setLocalProjects(filterProjectsForSection(loadLocalProjects()));
    toast.success('Project removed');
  }

  function deleteConversation(id: string, kind: 'session' | 'archive') {
    if (kind === 'session') {
      removeTerminalHistoryEntry(id);
      setHistory(loadTerminalHistory());
    } else {
      removeChatArchiveEntry(id);
      setArchives(loadChatArchive());
    }
    toast.success('Conversation removed');
  }

  const hasProjects = filteredLocal.length > 0 || filteredRemote.length > 0;

  return (
    <PageFullscreenFrame>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <FolderOpen className="w-7 h-7 text-[var(--accent)]" />
              My Projects
            </h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              GitHub-connected builds and every saved conversation — open any item to continue exactly where you left off.
            </p>
          </div>
          <Link href="/dashboard" className="xv-footer-pill !text-[var(--foreground)] flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> New via Command
          </Link>
        </div>

        <div className="flex gap-2 p-1 rounded-xl bg-[var(--card)] border border-[var(--card-border)] w-fit">
          {(['projects', 'conversations'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTab(key);
                router.replace(key === 'conversations' ? '/dashboard/projects?tab=conversations' : '/dashboard/projects');
              }}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                tab === key
                  ? 'bg-[var(--accent)] text-[var(--background)]'
                  : 'text-[var(--muted)] hover:text-[var(--foreground)]',
              )}
            >
              {key === 'projects' ? 'Code & Repos' : 'Conversations'}
            </button>
          ))}
        </div>

        <SectionSearchBar
          value={query}
          onChange={setQuery}
          placeholder={tab === 'projects' ? 'Search projects & repos…' : 'Search conversations…'}
        />

        {tab === 'projects' ? (
          loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} height={180} baseColor="var(--card)" highlightColor="var(--card-border)" />
              ))}
            </div>
          ) : hasProjects ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRemote.map((p) => (
                <article
                  key={p.id}
                  className="group rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-transparent to-[var(--card)] overflow-hidden hover:border-[var(--accent)]/40 transition-all"
                >
                  <div className="h-20 bg-gradient-to-br from-[var(--accent)]/20 via-violet-500/10 to-transparent relative">
                    <div className="absolute bottom-2 left-3 flex items-center gap-2 text-xs font-semibold">
                      <Link2 className="w-4 h-4 text-emerald-400" />
                      {p.github_repo_name ?? 'GitHub repo'}
                    </div>
                  </div>
                  <div className="p-4 space-y-2">
                    <h3 className="font-semibold line-clamp-2 group-hover:text-[var(--accent)]">{p.name}</h3>
                    <p className="text-xs text-[var(--muted)] capitalize">{p.type}</p>
                    {p.github_repo_url && (
                      <a
                        href={p.github_repo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-3 h-3" />
                        {p.github_repo_name}
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => openRemoteProject(p)}
                      className="w-full mt-2 px-3 py-2 rounded-lg text-xs font-semibold bg-[var(--accent)]/15 text-[var(--accent)] hover:bg-[var(--accent)]/25"
                    >
                      Open project & code
                    </button>
                  </div>
                </article>
              ))}
              {filteredLocal.map((p) => (
                <SectionCompactCard
                  key={p.id}
                  title={p.name}
                  subtitle={p.type}
                  dateIso={p.updatedAt}
                  onOpen={() => openLocalProject(p)}
                  onDelete={() => deleteLocal(p.id)}
                  openLabel="Continue in terminal"
                />
              ))}
            </div>
          ) : (
            <div className="glass-panel rounded-2xl p-10 text-center border border-dashed border-[var(--card-border)]">
              <Sparkles className="w-10 h-10 mx-auto text-[var(--accent)]/50 mb-4" />
              <p className="text-[var(--muted)] mb-2">No projects yet.</p>
              <p className="text-sm text-[var(--muted)] mb-6">
                Ask Xroga to build anything — crypto dashboards, chatbots, SaaS, games, APIs, and more.
              </p>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--background)] text-sm font-semibold hover:opacity-90"
              >
                <Rocket className="w-4 h-4" /> Go to Workspace
              </Link>
            </div>
          )
        ) : (
          <div className="space-y-6">
            {conversationItems.length > 0 ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {conversationItems.map((item) => (
                  <article
                    key={item.id}
                    className={cn(
                      'group rounded-2xl border p-4 flex flex-col gap-2 hover:border-[var(--accent)]/40 transition-all',
                      item.githubRepoUrl
                        ? 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-[var(--card)]'
                        : 'border-[var(--card-border)] glass-panel',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {item.githubRepoUrl ? (
                        <Code2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <MessageSquare className="w-4 h-4 text-[var(--accent)]" />
                      )}
                      <span className="text-[10px] font-semibold uppercase text-[var(--muted)]">
                        {item.githubRepoUrl ? 'Build session' : 'Conversation'}
                      </span>
                    </div>
                    <button type="button" onClick={() => openConversation(item)} className="text-left flex-1">
                      <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-[var(--accent)]">
                        {item.title}
                      </h3>
                      <p className="text-xs text-[var(--muted)] mt-1 line-clamp-2">{item.subtitle}</p>
                    </button>
                    {item.githubRepoUrl && (
                      <a
                        href={item.githubRepoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-emerald-400 hover:underline inline-flex items-center gap-1"
                      >
                        <Link2 className="w-3 h-3" />
                        {item.githubRepoName}
                      </a>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => openConversation(item)}
                        className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent)]/15 text-[var(--accent)]"
                      >
                        Resume exactly
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteConversation(item.id, item.kind)}
                        className="px-2 py-1.5 rounded-lg text-xs text-[var(--muted)] hover:text-red-400"
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-center text-[var(--muted)] py-8">No saved conversations yet — chats auto-save here.</p>
            )}
            <div className="glass-panel rounded-2xl overflow-hidden">
              <SwarmRunHistory search={query} />
            </div>
          </div>
        )}
      </div>
    </PageFullscreenFrame>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-[var(--muted)]">Loading projects…</div>}>
      <ProjectsHubInner />
    </Suspense>
  );
}
