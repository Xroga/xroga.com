'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  FolderOpen,
  Plus,
  Rocket,
  Sparkles,
  MessageSquare,
  Code2,
  Link2,
} from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';
import { SectionSearchBar } from '@/components/ui/SectionSearchBar';
import { SectionCompactCard } from '@/components/dashboard/SectionCompactCard';
import { GitHubProjectCard } from '@/components/projects/GitHubProjectCard';
import { continueGithubProject, loadGithubProjectSession } from '@/lib/projectResume';
import { GITHUB_PROJECT_SAVED_EVENT, GITHUB_REPO_CONTEXT_EVENT } from '@/lib/githubProjectEvents';
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
import { getSelectedRepoContext } from '@/lib/repoContext';
import { resumeToDashboard } from '@/lib/workspacePersistence';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import 'react-loading-skeleton/dist/skeleton.css';

type Tab = 'projects' | 'conversations';

function ProjectsHubInner() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'conversations' ? 'conversations' : 'projects';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [projects, setProjects] = useState<Project[]>([]);
  const [localProjects, setLocalProjects] = useState<LocalProjectEntry[]>([]);
  const [history, setHistory] = useState<TerminalHistoryEntry[]>([]);
  const [archives, setArchives] = useState<ChatArchiveEntry[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const router = useRouter();
  const { setPrompt, restoreTerminalSession } = useTerminalChat();

  useEffect(() => {
    setTab(searchParams.get('tab') === 'conversations' ? 'conversations' : 'projects');
  }, [searchParams]);

  useEffect(() => {
    const syncRepo = () => setSelectedRepo(getSelectedRepoContext()?.repo ?? null);
    syncRepo();
    window.addEventListener(GITHUB_REPO_CONTEXT_EVENT, syncRepo);
    window.addEventListener('storage', syncRepo);
    return () => {
      window.removeEventListener(GITHUB_REPO_CONTEXT_EVENT, syncRepo);
      window.removeEventListener('storage', syncRepo);
    };
  }, []);

  useEffect(() => {
    setLocalProjects(filterProjectsForSection(loadLocalProjects()));
    setHistory(loadTerminalHistory());
    setArchives(loadChatArchive());
    const loadRemote = () => {
      const normalizeGithubProject = (p: Project): Project => {
        if (p.github_repo_name?.includes('/')) return p;
        const url = p.github_repo_url ?? '';
        const match = url.match(/github\.com\/([^/]+\/[^/?#]+)/i);
        if (match?.[1]) {
          return { ...p, github_repo_name: match[1].replace(/\.git$/, '') };
        }
        return p;
      };
      api.projects
        .listGithub()
        .then((list) => {
          const normalized = list.map(normalizeGithubProject).filter((p) => p.github_repo_name?.includes('/'));
          if (normalized.length > 0) {
            setProjects(normalized);
            return;
          }
          return api.projects.list().then((all) =>
            setProjects(
              all
                .map(normalizeGithubProject)
                .filter((p) => p.github_repo_name?.includes('/') || Boolean(p.github_repo_url))
            )
          );
        })
        .catch(() => setProjects([]))
        .finally(() => setLoading(false));
    };
    loadRemote();
    const onSaved = () => loadRemote();
    window.addEventListener(GITHUB_PROJECT_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(GITHUB_PROJECT_SAVED_EVENT, onSaved);
  }, []);

  const filteredLocal = useMemo(() => {
    const q = query.trim().toLowerCase();
    const repoScoped = selectedRepo
      ? localProjects.filter((p) => p.githubRepoName === selectedRepo)
      : localProjects;
    if (!q) return repoScoped;
    return repoScoped.filter(
      (p) => p.name.toLowerCase().includes(q) || p.prompt.toLowerCase().includes(q) || p.type.includes(q),
    );
  }, [localProjects, query, selectedRepo]);

  const filteredRemote = useMemo(() => {
    const q = query.trim().toLowerCase();
    const repoScoped = selectedRepo
      ? projects.filter((p) => p.github_repo_name === selectedRepo)
      : projects;
    if (!q) return repoScoped;
    return repoScoped.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.type.toLowerCase().includes(q) ||
        (p.github_repo_name?.toLowerCase().includes(q) ?? false),
    );
  }, [projects, query, selectedRepo]);

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
        githubRepoUrl: a.githubRepoUrl,
        githubRepoName: a.githubRepoName,
        kind: 'archive',
      });
    }

    items.sort((a, b) => Date.parse(b.dateIso) - Date.parse(a.dateIso));
    const repoScoped = selectedRepo
      ? items.filter((i) => i.githubRepoName === selectedRepo)
      : items;
    const q = query.trim().toLowerCase();
    if (!q) return repoScoped;
    return repoScoped.filter(
      (i) => i.title.toLowerCase().includes(q) || i.subtitle.toLowerCase().includes(q),
    );
  }, [history, archives, query, selectedRepo]);

  async function openConversation(item: (typeof conversationItems)[0]) {
    const { loadTerminalHistoryEntry } = await import('@/lib/terminalSessionStorage');
    const full = await loadTerminalHistoryEntry(item.sessionId);
    const messages = full?.messages?.length ? full.messages : item.messages;
    if (!messages?.length) {
      toast.error('Could not restore this conversation.');
      return;
    }
    const promptText = item.messages.find((m) => m.role === 'user')?.content ?? item.title;
    await restoreTerminalSession({
      sessionId: item.sessionId,
      prompt: promptText,
      messages,
      selectedId: item.id,
      selectedLabel: item.title,
      source: 'chats',
      jumpMessageId: item.jumpMessageId,
    });
    router.push('/workspace');
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
    router.push('/workspace');
  }

  async function openRemoteProject(project: Project) {
    const session = await loadGithubProjectSession(project);
    if (session.messages.length) {
      await restoreTerminalSession({
        sessionId: session.sessionId,
        prompt: session.prompt,
        messages: session.messages,
        selectedId: project.id,
        selectedLabel: project.name,
        source: 'projects',
      });
      router.push('/workspace');
    } else {
      await continueGithubProject(project, router);
    }
    toast('Restored — continue where you left off', { icon: '📍' });
  }

  async function deleteRemote(id: string) {
    try {
      await api.projects.delete(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      toast.success('Project removed from Xroga');
    } catch {
      toast.error('Could not delete project');
    }
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

  const hasGithubProjects = filteredRemote.length > 0;
  const hasLocalInConversations = filteredLocal.length > 0;
  const currentRepoProjects = selectedRepo
    ? filteredRemote.filter((p) => p.github_repo_name === selectedRepo)
    : filteredRemote;
  const otherRepoProjects = selectedRepo
    ? filteredRemote.filter((p) => p.github_repo_name && p.github_repo_name !== selectedRepo)
    : [];

  return (
    <PageFullscreenFrame>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <FolderOpen className="w-7 h-7 text-[var(--accent)]" />
              Projects
            </h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              Repository-scoped builds and conversations — choose a repo once, then work only inside that repo until you open a new terminal.
            </p>
            {selectedRepo && (
              <p className="mt-2 text-xs font-mono text-[var(--accent)]">
                Current repository: {selectedRepo}
              </p>
            )}
          </div>
          <Link href="/workspace" className="xv-footer-pill !text-[var(--foreground)] flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> New Terminal
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
          ) : hasGithubProjects ? (
            <div className="space-y-6">
              {currentRepoProjects.length > 0 && (
                <section className="space-y-3">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
                      Current GitHub repository
                    </h2>
                    {selectedRepo && <p className="text-xs font-mono text-[var(--accent)] mt-1">{selectedRepo}</p>}
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {currentRepoProjects.map((p) => (
                      <GitHubProjectCard
                        key={p.id}
                        project={p}
                        onContinue={() => openRemoteProject(p)}
                        onDelete={() => {
                          if (confirm(`Remove "${p.name}" from Xroga? GitHub repo stays untouched.`)) {
                            void deleteRemote(p.id);
                          }
                        }}
                        onOpenRepo={() => {
                          if (p.github_repo_url) window.open(p.github_repo_url, '_blank', 'noopener,noreferrer');
                        }}
                      />
                    ))}
                  </div>
                </section>
              )}
              {otherRepoProjects.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
                    Old GitHub repositories
                  </h2>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {otherRepoProjects.map((p) => (
                      <GitHubProjectCard
                        key={p.id}
                        project={p}
                        onContinue={() => openRemoteProject(p)}
                        onDelete={() => {
                          if (confirm(`Remove "${p.name}" from Xroga? GitHub repo stays untouched.`)) {
                            void deleteRemote(p.id);
                          }
                        }}
                        onOpenRepo={() => {
                          if (p.github_repo_url) window.open(p.github_repo_url, '_blank', 'noopener,noreferrer');
                        }}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className="glass-panel rounded-2xl p-10 text-center border border-dashed border-[var(--card-border)]">
              <Sparkles className="w-10 h-10 mx-auto text-[var(--accent)]/50 mb-4" />
              <p className="text-[var(--muted)] mb-2">No projects yet.</p>
              <p className="text-sm text-[var(--muted)] mb-6">
                Ask Xroga to build anything — websites, SaaS, Chrome extensions, desktop apps, mobile, games, APIs, and more.
              </p>
              <Link
                href="/workspace"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--background)] text-sm font-semibold hover:opacity-90"
              >
                <Rocket className="w-4 h-4" /> Go to Workspace
              </Link>
            </div>
          )
        ) : (
          <div className="space-y-6">
            {hasLocalInConversations ? (
              <div>
                <h2 className="text-sm font-semibold text-[var(--muted)] mb-3 uppercase tracking-wide">
                  Terminal builds (no GitHub repo)
                </h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
              </div>
            ) : null}
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
